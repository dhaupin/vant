#!/usr/bin/env node
/**
 * S3 connector tests (prd-storage — Slice R1)
 *
 * lib/connectors/s3.js: own S3-API client (SigV4 + fetch) for AWS S3, Cloudflare R2,
 * MinIO, Backblaze B2. OFFLINE test suite: endpoint/key resolution, SigV4
 * known-answer verification (canonical request rebuilt from the AWS spec,
 * independently of lib code), credential-safety, and networkless refusal
 * paths. No real HTTP anywhere — every await either throws in validation or
 * is asserted only for synchronous pre-fetch behavior.
 */

const mod = require('../lib/connectors/s3');

const results = { passed: 0, failed: 0 };
const failures = [];
const _pending = [];

function test(name, fn) {
    try {
        const p = fn();
        if (p && typeof p.then === 'function') {
            // async test — chain into the pending set, resolve before summary
            _pending.push(p.then(ok => {
                if (ok === true || (ok && ok.success)) {
                    results.passed++;
                    console.log(`  ✓ ${name}`);
                } else {
                    results.failed++;
                    const msg = (ok && ok.error) || 'failed';
                    failures.push(`${name}: ${msg}`);
                    console.log(`  ✗ ${name}: ${msg}`);
                }
            }).catch(e => {
                results.failed++;
                failures.push(`${name}: ${e.message}`);
                console.log(`  ✗ ${name}: ${e.message}`);
            }));
            return;
        }
        if (p === true || (p && p.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            const msg = (p && p.error) || 'failed';
            failures.push(`${name}: ${msg}`);
            console.log(`  ✗ ${name}: ${msg}`);
        }
    } catch (e) {
        results.failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const C = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };

console.log('\n🌐 REMOTE CONNECTORS — S3-API CLIENT TESTS\n');

test('module shape: createClient/PROVIDERS/_sign/_safeKey exported', () => {
    if (typeof mod.createClient !== 'function') return { success: false, error: 'createClient missing' };
    if (typeof mod._sign !== 'function') return { success: false, error: '_sign missing' };
    if (typeof mod._safeKey !== 'function') return { success: false, error: '_safeKey missing' };
    for (const p of ['s3', 'r2', 'minio', 'b2']) {
        if (!mod.PROVIDERS[p]) return { success: false, error: 'provider preset missing: ' + p };
    }
    return true;
});

test('_safeKey: accepts ordinary keys, strips trailing slashes', () => {
    if (mod._safeKey('brains/vant/identity.md') !== 'brains/vant/identity.md') return { success: false, error: 'plain key rejected' };
    if (mod._safeKey('file.json/') !== 'file.json') return { success: false, error: 'trailing slash not stripped' };
    if (mod._safeKey('a.b_c-d/e.txt') !== 'a.b_c-d/e.txt') return { success: false, error: 'charset ok key rejected' };
    return true;
});

test('_safeKey: blocks traversal, absolute, backslash, empty, long', () => {
    const bad = ['../escape', 'a/../b', 'a/../../b', '/abs/path', 'C:\\x', 'a\\b', '', null, 'x'.repeat(2000), '.hidden', 'spaces in/key'];
    for (const k of bad) {
        let threw = false;
        try { mod._safeKey(k); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'accepted bad key: ' + JSON.stringify(k) };
    }
    return true;
});

test('_resolveEndpoint: all four providers', () => {
    const s3 = mod._resolveEndpoint('s3', 'vant', 'us-west-2');
    if (s3.url !== 'https://vant.s3.us-west-2.amazonaws.com') return { success: false, error: 's3 url: ' + s3.url };
    const r2 = mod._resolveEndpoint('r2', 'vant', 'abc123acct');
    if (r2.url !== 'https://abc123acct.r2.cloudflarestorage.com/vant') return { success: false, error: 'r2 url: ' + r2.url };
    const minio = mod._resolveEndpoint('minio', 'vant', undefined);
    if (minio.url !== 'http://localhost:9000/vant') return { success: false, error: 'minio url: ' + minio.url };
    const b2 = mod._resolveEndpoint('b2', 'vant', 'us-west-004');
    if (b2.url !== 'https://us-west-004.backblazeb2.com/vant') return { success: false, error: 'b2 url: ' + b2.url };
    let threw = false;
    try { mod._resolveEndpoint('b2', 'vant', undefined); } catch (e) { threw = true; }
    if (!threw) return { success: false, error: 'b2 without region must throw' };
    return true;
});

test('createClient: refuses unknown provider / bad bucket / missing creds / non-http endpoint', () => {
    const cases = [
        () => mod.createClient({ provider: 'gcs', bucket: 'b', ...C }),
        () => mod.createClient({ provider: 's3', bucket: 'b', sessionToken: 123 }),
        () => mod.createClient({ provider: 's3', ...C }),
        () => mod.createClient({ provider: 's3', bucket: 'b', accessKeyId: 'a' }),
        () => mod.createClient({ provider: 's3', bucket: 'b', secretAccessKey: 's' }),
        () => mod.createClient({ provider: 'minio', bucket: 'b', endpoint: 'ftp://x', ...C })
    ];
    for (const c of cases) {
        let threw = false;
        try { c(); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'bad config accepted' };
    }
    return true;
});

test('sigv4: known canonical request (rebuilt from AWS spec) reproduces signature', async () => {
    // Fixed-date GET on examplebucket. The canonical request below is
    // hand-built from the SigV4 spec (sorted headers, UNSIGNED-PAYLOAD,
    // service 's3'); the expected signature is derived independently here.
    const url = 'https://examplebucket.s3.us-east-1.amazonaws.com/test.txt';
    const date = new Date('2013-05-24T00:00:00Z');
    const headers = mod._sign('GET', url, { range: 'bytes=0-9' }, undefined, C, 'us-east-1', date);

    const auth = headers['authorization'] || '';
    if (!auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20130524/us-east-1/s3/aws4_request')) {
        return { success: false, error: 'credential scope wrong: ' + auth };
    }
    if (!auth.includes('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date')) {
        return { success: false, error: 'signed headers wrong: ' + auth };
    }

    const crypto = require('crypto');
    const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
    const sha = (d) => crypto.createHash('sha256').update(d).digest('hex');

    // Header block: each line carries its own trailing \n (per spec), so the
    // join('\n') separators only go BETWEEN the five canonical sections.
    const canonicalRequest = [
        'GET',
        '/test.txt',
        '',
        'host:examplebucket.s3.us-east-1.amazonaws.com\n' +
        'range:bytes=0-9\n' +
        'x-amz-content-sha256:UNSIGNED-PAYLOAD\n' +
        'x-amz-date:20130524T000000Z\n',
        'host;range;x-amz-content-sha256;x-amz-date',
        'UNSIGNED-PAYLOAD'
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        '20130524T000000Z',
        '20130524/us-east-1/s3/aws4_request',
        sha(canonicalRequest)
    ].join('\n');

    const kDate = hmac('AWS4' + C.secretAccessKey, '20130524');
    const kRegion = hmac(kDate, 'us-east-1');
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const expected = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const got = (auth.match(/Signature=([0-9a-f]{64})/) || [])[1];
    if (got !== expected) return { success: false, error: 'signature mismatch' };

    if (headers['x-amz-date'] !== '20130524T000000Z') return { success: false, error: 'amz date wrong' };
    if (headers['x-amz-content-sha256'] !== 'UNSIGNED-PAYLOAD') return { success: false, error: 'payload mode wrong' };
    if (JSON.stringify(headers).includes('wJalrXUtnFEMI')) return { success: false, error: 'secret leaked into headers' };
    return true;
});

test('sigv4: query string is canonicalized (sorted, encoded) — object listing shape', () => {
    const url = 'https://examplebucket.s3.us-east-1.amazonaws.com/?list-type=2&prefix=brains%2F&delimiter=%2F';
    const headers = mod._sign('GET', url, {}, undefined, C, 'us-east-1', new Date('2013-05-24T00:00:00Z'));
    const auth = headers['authorization'] || '';
    // signed headers for a headerless GET: host + the two amz headers
    if (!auth.includes('SignedHeaders=host;x-amz-content-sha256;x-amz-date')) {
        return { success: false, error: 'signed headers wrong: ' + auth };
    }
    return true;
});

test('client keys: traversal/nonsense keys throw before any network call', async () => {
    const client = mod.createClient({ provider: 'r2', bucket: 'vant', region: 'acct', ...C });
    const badOps = [
        () => client.put('../evil', 'x'),
        () => client.get('/abs'),
        () => client.delete('a/../../b'),
        () => client.stat('..'),
        () => client.list('a/../b')
    ];
    for (const op of badOps) {
        let threw = false;
        try { await op(); } catch (e) { threw = /EREMOTE/.test(e.message); if (!threw) return { success: false, error: 'wrong error: ' + e.message }; }
        if (!threw) return { success: false, error: 'bad key accepted by an op' };
    }
    return true;
});

test('client: prefix normalization + test() failure path is graceful without network', async () => {
    const client = mod.createClient({ provider: 'minio', bucket: 'vant', prefix: 'brains', ...C, timeoutMs: 250 });
    if (client.prefix !== 'brains/') return { success: false, error: 'prefix not normalized: ' + client.prefix };
    // test() against a dead endpoint must resolve (not throw) with ok:false
    const r = await client.test();
    if (typeof r.ok !== 'boolean' || r.ok !== false || !r.error) {
        return { success: false, error: 'test() should fail gracefully offline' };
    }
    if (JSON.stringify(r).includes('wJalrXUtnFEMI')) return { success: false, error: 'secret leaked into error' };
    return true;
});

(async () => {
    await Promise.all(_pending);
    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('\n  FAILURES:');
        failures.forEach(f => console.log('   - ' + f));
    }
    process.exit(results.failed > 0 ? 1 : 0);
})();
