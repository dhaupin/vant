#!/usr/bin/env node
/**
 * Cloudflare R2 delegation tests (prd-storage follow-up, v0.9.0-axolotl)
 *
 * connectors/cloudflare.js r2* ops now ride the S3-API client in
 * connectors/s3.js (R2's native S3 endpoint, SigV4 with R2 access keys)
 * instead of the Cloudflare control-plane API (Bearer CF_API_TOKEN).
 * OFFLINE suite: gating via configure(), delegation shapes via the
 * _setR2TestClient DI hook, event emissions, and control-token decoupling.
 * No network anywhere.
 */

const cf = require('../lib/connectors/cloudflare');
const adapters = require('../lib/adapters/cloudflare');
const events = require('../lib/event');

const results = { passed: 0, failed: 0 };
const failures = [];
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
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
        });
    });
}

// ---- fake S3 client (records ops, in-memory objects) ----
function makeFakeClient() {
    const objs = new Map();
    const ops = [];
    return {
        ops,
        async put(key, content, opts) { ops.push(['put', key, opts && opts.contentType]); objs.set(key, String(content)); return true; },
        async get(key) { ops.push(['get', key]); return objs.has(key) ? objs.get(key) : null; },
        async list(prefix) { ops.push(['list', prefix]); return [...objs.keys()].filter(k => k.startsWith(prefix || '')).map(k => ({ key: k, size: objs.get(k).length, etag: '"fake"' })); },
        async delete(key) { ops.push(['delete', key]); return objs.delete(key); },
        _objs: objs
    };
}

const UNCONFIGURED = {
    accountId: undefined, apiToken: undefined, pagesUrl: undefined,
    kvNamespace: undefined, r2Bucket: undefined, workerUrl: undefined, workerName: undefined,
    r2AccessKeyId: undefined, r2SecretAccessKey: undefined,
    r2Jurisdiction: undefined, r2Endpoint: undefined
};

console.log('\n☁️  CLOUDFLARE R2 → S3 CLIENT DELEGATION TESTS\n');

test('modules load; adapter r2() interface has get/put/list/delete', () => {
    const iface = adapters.r2();
    for (const m of ['get', 'put', 'list', 'delete']) {
        if (typeof iface[m] !== 'function') return { success: false, error: 'adapter r2().' + m + ' missing' };
    }
    if (typeof cf.r2Delete !== 'function') return { success: false, error: 'connector r2Delete missing' };
    if (typeof cf._setR2TestClient !== 'function' || typeof cf._r2Client !== 'function') {
        return { success: false, error: 'DI hooks not exported' };
    }
    return true;
});

test('gating: unconfigured r2* ops refuse with STORAGE_NOT_FOUND (no network)', async () => {
    cf._setR2TestClient(null);
    cf.configure(UNCONFIGURED);
    for (const [op, args] of [['r2Get', ['k']], ['r2Put', ['k', 'v']], ['r2List', ['']], ['r2Delete', ['k']]]) {
        let threw = null;
        try { await cf[op](...args); } catch (e) { threw = e; }
        if (!threw) return { success: false, error: op + ' did not refuse unconfigured' };
        if (!/STORAGE_NOT_FOUND|R2 not configured/.test(String(threw.code || '') + String(threw.message))) {
            return { success: false, error: op + ' wrong refusal: ' + threw.message };
        }
    }
    return true;
});

test('r2Get: existing → body string; missing → body null (S3 404 normalization)', async () => {
    const fake = makeFakeClient();
    cf._setR2TestClient(fake);
    cf.configure({ ...UNCONFIGURED, r2Bucket: 'b', r2AccessKeyId: 'k', r2SecretAccessKey: 's' });
    await fake.put('a.txt', 'hello');
    const hit = await cf.r2Get('a.txt');
    if (hit.body !== 'hello') return { success: false, error: 'body mismatch: ' + JSON.stringify(hit) };
    const miss = await cf.r2Get('nope.txt');
    if (miss.body !== null) return { success: false, error: 'missing key must normalize to body:null' };
    return true;
});

test('r2Put: string + object payload, default + explicit contentType reach the client', async () => {
    const fake = makeFakeClient();
    cf._setR2TestClient(fake);
    await cf.r2Put('s.txt', 'plain');
    if (fake.ops[0][2] !== 'application/octet-stream') return { success: false, error: 'default contentType wrong' };
    await cf.r2Put('o.json', { a: 1 }, { contentType: 'application/json' });
    if (JSON.parse(fake._objs.get('o.json')).a !== 1) return { success: false, error: 'object not JSON-stringified' };
    if (fake.ops[1][2] !== 'application/json') return { success: false, error: 'explicit contentType lost' };
    return true;
});

test('r2List/r2Delete: shapes match the old contract, plus the new delete', async () => {
    const fake = makeFakeClient();
    cf._setR2TestClient(fake);
    await fake.put('p/1.txt', '12345');
    const listed = await cf.r2List('p/');
    if (listed.prefix !== 'p/' || listed.objects.length !== 1) return { success: false, error: 'list shape wrong: ' + JSON.stringify(listed) };
    if (listed.objects[0].size !== 5 || !listed.objects[0].etag) return { success: false, error: 'size/etag not parsed: ' + JSON.stringify(listed.objects[0]) };
    const del = await cf.r2Delete('p/1.txt');
    if (!del.ok || del.deleted !== true) return { success: false, error: 'delete shape wrong: ' + JSON.stringify(del) };
    const del2 = await cf.r2Delete('p/1.txt');
    if (del2.deleted !== false) return { success: false, error: 'delete(missing) must be deleted:false' };
    return true;
});

test('events: cf:r2:get/put/list/delete still emitted with payloads', async () => {
    const seen = [];
    const handlers = {};
    for (const ev of ['cf:r2:get', 'cf:r2:put', 'cf:r2:list', 'cf:r2:delete']) {
        handlers[ev] = (d) => seen.push([ev, d]);
        events.on(ev, handlers[ev]);
    }
    try {
        const fake = makeFakeClient();
        cf._setR2TestClient(fake);
        await cf.r2Put('e.txt', 'x');
        await cf.r2Get('e.txt');
        await cf.r2List('');
        await cf.r2Delete('e.txt');
        const kinds = new Set(seen.map(s => s[0]));
        for (const ev of ['cf:r2:get', 'cf:r2:put', 'cf:r2:list', 'cf:r2:delete']) {
            if (!kinds.has(ev)) return { success: false, error: 'event missing: ' + ev };
        }
        const putEvt = seen.find(s => s[0] === 'cf:r2:put')[1];
        if (putEvt.key !== 'e.txt') return { success: false, error: 'event payload wrong' };
        return true;
    } finally {
        for (const [ev, h] of Object.entries(handlers)) events.off(ev, h);
    }
});

test('control-token decoupling: r2 ops work with NO CF_API_TOKEN (S3 keys only)', async () => {
    const fake = makeFakeClient();
    cf._setR2TestClient(fake);
    cf.configure({ ...UNCONFIGURED, r2Bucket: 'b', r2AccessKeyId: 'k', r2SecretAccessKey: 's' });
    const cfg = cf.getConfig();
    if (cfg.apiToken) return { success: false, error: 'test needs apiToken absent to prove decoupling' };
    await cf.r2Put('d.txt', 'x');
    const got = await cf.r2Get('d.txt');
    if (got.body !== 'x') return { success: false, error: 'r2 ops failed without control token' };
    return true;
});

test('_r2Client(): builds a real r2 client from config; DI overrides it', () => {
    cf._setR2TestClient(null);
    cf.configure({ ...UNCONFIGURED, r2Bucket: 'cfg-bucket', accountId: 'acct-123', r2AccessKeyId: 'k', r2SecretAccessKey: 's' });
    const real = cf._r2Client();
    if (real.provider !== 'r2' || real.bucket !== 'cfg-bucket') {
        return { success: false, error: 'real client misconfigured: ' + JSON.stringify({ p: real.provider, b: real.bucket }) };
    }
    const fake = makeFakeClient();
    cf._setR2TestClient(fake);
    if (cf._r2Client() !== fake) return { success: false, error: 'DI override ignored' };
    cf._setR2TestClient(null);
    return true;
});

test('getStatus reports hasR2Keys; KV/Pages paths untouched (control API intact)', () => {
    cf._setR2TestClient(null);
    cf.configure({ ...UNCONFIGURED, r2Bucket: 'b', r2AccessKeyId: 'k', r2SecretAccessKey: 's', accountId: 'a', apiToken: 't', kvNamespace: 'n' });
    const st = cf.getStatus();
    if (st.config.hasR2Keys !== true) return { success: false, error: 'hasR2Keys missing: ' + JSON.stringify(st.config) };
    const src = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'lib', 'connectors', 'cloudflare.js'), 'utf8');
    if (!src.includes('storage/kv/namespaces/')) return { success: false, error: 'KV control-API path was removed?!' };
    if (!src.includes('client/v4/accounts')) return { success: false, error: 'control API usage removed entirely?!' };
    return true;
});

(async () => {
    await _chain;
    cf._setR2TestClient(null);
    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('\n  FAILURES:');
        failures.forEach(f => console.log('   - ' + f));
    }
    process.exit(results.failed > 0 ? 1 : 0);
})();
