#!/usr/bin/env node
/**
 * RemoteStorage tests (prd-storage — Slice R2)
 *
 * lib/storage.js RemoteStorage: FileStorage-shaped store over lib/remote's
 * S3-API client. OFFLINE suite — every test injects a fake client via the
 * constructor DI point (options.client); no network anywhere. Covers:
 * config resolution + pseudo basePath + secret hygiene, prefix round-trip
 * mapping, lazy-not-configured refusal, full CRUD contract vs FileStorage
 * semantics, capability gating (B-2 shared gate), metrics recording, the
 * factory case, and push/pull sync helpers.
 *
 * Tests run SERIALIZED (promise chain) — the gating test mutates the shared
 * default sandbox, so concurrent async tests would see its state.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const mod = require('../lib/storage');
const { RemoteStorage, FileStorage } = mod;
const metrics = require('../lib/metrics');

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

// ---- fake S3 client (records ops, in-memory object store) ----
function makeFakeClient() {
    const objs = new Map(); // key -> string content
    const ops = [];
    const client = {
        ops,
        async put(key, content) { ops.push(['put', key]); objs.set(key, Buffer.isBuffer(content) ? content.toString('utf8') : String(content)); return true; },
        async get(key) { ops.push(['get', key]); return objs.has(key) ? objs.get(key) : null; },
        async stat(key) { ops.push(['stat', key]); return objs.has(key) ? { key, size: objs.get(key).length, etag: 'fake', lastModified: null } : null; },
        // S3 ListObjectsV2 shape: objects + CommonPrefix (trailing '/') groups
        async list(sub) {
            ops.push(['list', sub || '']);
            const out = [];
            const seen = new Set();
            for (const k of [...objs.keys()].sort()) {
                if (sub && !k.startsWith(sub)) continue;
                const rest = k.slice(sub.length);
                const slash = rest.indexOf('/');
                if (slash > 0) {
                    const p = sub + rest.slice(0, slash) + '/';
                    if (!seen.has(p)) { seen.add(p); out.push({ key: p }); }
                } else {
                    out.push({ key: k });
                }
            }
            return out;
        },
        async delete(key) { ops.push(['delete', key]); return objs.delete(key); }
    };
    client._objs = objs;
    return client;
}

function mkStore(client, extra = {}) {
    return new RemoteStorage({
        provider: 'minio', bucket: 'vant-test',
        accessKeyId: 'AKID-test', secretAccessKey: 'SECRET-test',
        client, ...extra
    });
}

console.log('\n🌐 REMOTE STORAGE STORE TESTS (prd-storage Slice R2)\n');

test('module shape: class exported + backend tag', () => {
    if (typeof RemoteStorage !== 'function') return { success: false, error: 'RemoteStorage class missing' };
    const s = mkStore(makeFakeClient());
    if (s.backend !== 'remote') return { success: false, error: 'backend tag missing' };
    return true;
});

test('config resolution: options > env, pseudo basePath, no secret leakage', () => {
    process.env.VANT_REMOTE_PROVIDER = 'r2';
    process.env.VANT_REMOTE_BUCKET = 'env-bucket';
    process.env.VANT_REMOTE_KEY = 'env-key';
    process.env.VANT_REMOTE_SECRET = 'env-secret';
    try {
        const envStore = new RemoteStorage({});
        if (envStore.provider !== 'r2' || envStore.bucket !== 'env-bucket') {
            return { success: false, error: 'env config not honored' };
        }
        if (envStore.basePath !== 'remote://r2/env-bucket') {
            return { success: false, error: 'pseudo basePath wrong: ' + envStore.basePath };
        }
        const optStore = new RemoteStorage({
            provider: 's3', bucket: 'opt-bucket', accessKeyId: 'opt-key',
            secretAccessKey: 'opt-secret', prefix: 'brains'
        });
        if (optStore.provider !== 's3' || optStore.bucket !== 'opt-bucket') {
            return { success: false, error: 'options must override env' };
        }
        const status = JSON.stringify(optStore.remoteStatus());
        if (status.includes('opt-secret') || status.includes('env-secret')) {
            return { success: false, error: 'secret leaked in remoteStatus()' };
        }
        return true;
    } finally {
        delete process.env.VANT_REMOTE_PROVIDER;
        delete process.env.VANT_REMOTE_BUCKET;
        delete process.env.VANT_REMOTE_KEY;
        delete process.env.VANT_REMOTE_SECRET;
    }
});

test('lazy refusal: unconfigured store refuses on first use with clear code', async () => {
    const s = new RemoteStorage({});
    if (s.remoteStatus().configured !== false) return { success: false, error: 'status should say unconfigured' };
    try { await s.read('x'); return { success: false, error: 'read should refuse' }; }
    catch (e) {
        if (!/STORAGE_REMOTE_NOT_CONFIGURED|not configured/i.test(String(e.code || e.message))) {
            return { success: false, error: 'wrong refusal: ' + e.message };
        }
        return true;
    }
});

test('prefix mapping: store keys get prefix, list strips it (round-trip)', async () => {
    const client = makeFakeClient();
    const s = mkStore(client, { prefix: 'tenant-a' });
    await s.write('brains/identity.md', '# hi');
    const remoteKeys = [...client._objs.keys()];
    if (!remoteKeys.includes('tenant-a/brains/identity.md')) {
        return { success: false, error: 'remote key missing prefix: ' + remoteKeys.join(',') };
    }
    const listed = await s.list();
    if (!listed.includes('brains/identity.md')) {
        return { success: false, error: 'list did not strip prefix: ' + JSON.stringify(listed) };
    }
    return true;
});

test('list: recursive by default, shallow parity on demand, glob-ish base filter', async () => {
    const client = makeFakeClient();
    const s = mkStore(client);
    await s.write('a/one.txt', '1');
    await s.write('a/b/two.txt', '2');
    await s.write('a/three.txt', '3');
    const all = await s.list('a');
    if (all.length !== 3 || !all.includes('a/b/two.txt')) {
        return { success: false, error: 'recursive list wrong: ' + JSON.stringify(all) };
    }
    const shallow = await s.list('a/*', { recursive: false });
    if (shallow.length !== 2 || !shallow.includes('a/one.txt')) {
        return { success: false, error: 'shallow list wrong: ' + JSON.stringify(shallow) };
    }
    const filtered = await s.list('a/two');
    if (filtered.length !== 1 || filtered[0] !== 'a/b/two.txt') {
        return { success: false, error: 'base filter wrong: ' + JSON.stringify(filtered) };
    }
    return true;
});

test('CRUD contract: read/write/has/stat/delete vs FileStorage semantics', async () => {
    const s = mkStore(makeFakeClient());
    if (await s.read('nope.txt') !== null) return { success: false, error: 'read(missing) must be null' };
    if (!(await s.write('a/b.txt', 'hello'))) return { success: false, error: 'write must return true' };
    if ((await s.read('a/b.txt')) !== 'hello') return { success: false, error: 'read round-trip failed' };
    if ((await s.has('a/b.txt')) !== true) return { success: false, error: 'has(existing) must be true' };
    if ((await s.has('a/missing.txt')) !== false) return { success: false, error: 'has(missing) must be false' };
    const st = await s.stat('a/b.txt');
    if (!st || st.size !== 5) return { success: false, error: 'stat wrong: ' + JSON.stringify(st) };
    if ((await s.delete('a/b.txt')) !== true) return { success: false, error: 'delete(existing) must be true' };
    if ((await s.delete('a/b.txt')) !== false) return { success: false, error: 'delete(missing) must be false' };
    return true;
});

test('write opts.format serializes objects (json) like FileStorage', async () => {
    const s = mkStore(makeFakeClient());
    await s.write('cfg.json', { a: 1 }, { format: 'json' });
    const raw = await s.read('cfg.json');
    if (JSON.parse(raw).a !== 1) return { success: false, error: 'format serialization failed: ' + raw };
    return true;
});

test('bad keys are refused BEFORE any network op (vaf + absolute/backslash guard)', async () => {
    const client = makeFakeClient();
    const s = mkStore(client);
    for (const k of ['../escape', '/abs', 'a/../b', 'C:\\evil']) {
        let threw = false;
        try { await s.write(k, 'x'); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'write accepted bad key: ' + k };
        threw = false;
        try { await s.read(k); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'read accepted bad key: ' + k };
        threw = false;
        try { await s.readRaw(k); } catch (e) { threw = true; }
        if (!threw) return { success: false, error: 'readRaw accepted bad key: ' + k };
    }
    if (client.ops.length !== 0) return { success: false, error: 'network calls made for bad keys' };
    return true;
});

test('capability gating: configured canWrite:false blocks write/delete (B-2 shared gate)', async () => {
    const sandbox = require('../lib/sandbox').defaultSandbox;
    if (!sandbox || typeof sandbox.setScopes !== 'function') return { success: false, error: 'sandbox unavailable' };
    const was = sandbox._explicitlyConfigured;
    sandbox._explicitlyConfigured = true;
    sandbox.setScopes({ canRead: true, canWrite: false });
    try {
        const s = mkStore(makeFakeClient());
        let wErr = null;
        try { await s.write('x.txt', 'x'); } catch (e) { wErr = e; }
        if (!wErr || !/STORAGE_WRITE_DENIED/.test(String(wErr.code || wErr.message))) {
            return { success: false, error: 'write not blocked: ' + (wErr && wErr.message) };
        }
        let dErr = null;
        try { await s.delete('x.txt'); } catch (e) { dErr = e; }
        if (!dErr) return { success: false, error: 'delete not blocked under canWrite:false' };
        // canRead:true still allows reads
        const s2 = mkStore(makeFakeClient());
        if (await s2.read('missing-again.txt') !== null) return { success: false, error: 'read broken under read-allowed config' };
        return true;
    } finally {
        sandbox._explicitlyConfigured = was;
    }
});

test('metrics: ops recorded against the pseudo basePath + registry series', async () => {
    const before = metrics.counterValue('vant_storage_ops_total', { op: 'write', outcome: 'ok' }) || 0;
    const s = mkStore(makeFakeClient());
    await s.write('m.txt', 'metrics!');
    const after = metrics.counterValue('vant_storage_ops_total', { op: 'write', outcome: 'ok' }) || 0;
    if (after - before !== 1) return { success: false, error: 'registry counter not incremented' };
    const agg = mod.getStorageMetrics().stores.find(x => x.basePath === s.basePath);
    if (!agg || !agg.ops.write) return { success: false, error: 'per-store metrics missing: ' + JSON.stringify(agg) };
    return true;
});

test('factory: getStorage("remote") via mod.get — singleton + per-options keying', () => {
    const a = mod.get('remote', { provider: 'minio', bucket: 'b1', accessKeyId: 'k', secretAccessKey: 's' });
    const b = mod.get('remote', { provider: 'minio', bucket: 'b1', accessKeyId: 'k', secretAccessKey: 's' });
    const c = mod.get('remote', { provider: 'minio', bucket: 'b2', accessKeyId: 'k', secretAccessKey: 's' });
    if (!(a instanceof RemoteStorage) || a !== b || c === a) return { success: false, error: 'factory singleton/keying broken' };
    let threw = false;
    try { mod.get('nope-not-real'); } catch (e) { threw = true; }
    if (!threw) return { success: false, error: 'unknown type must throw' };
    return true;
});

test('pushFrom/pullTo: local FileStorage tree ↔ remote (round-trip)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-remote-push-'));
    try {
        const local = new FileStorage({ basePath: tmp });
        local.write('dir/note.md', 'push me');
        local.write('root.txt', 'root content');
        const client = makeFakeClient();
        const remote = mkStore(client);
        const pushed = await remote.pushFrom(local);
        if (pushed.pushed !== 2 || pushed.errors !== 0) return { success: false, error: 'push bad: ' + JSON.stringify(pushed) };
        if (!client._objs.has('dir/note.md')) return { success: false, error: 'pushed key missing' };
        const dry = await remote.pushFrom(local, { dryRun: true });
        if (dry.pushed !== 2 || [...client._objs.keys()].length !== 2) return { success: false, error: 'dryRun mutated remote' };

        // wipe local, pull back (recursive default listing)
        fs.rmSync(path.join(tmp, 'dir'), { recursive: true, force: true });
        fs.unlinkSync(path.join(tmp, 'root.txt'));
        const pulled = await remote.pullTo(local);
        if (pulled.pulled !== 2 || pulled.errors !== 0) return { success: false, error: 'pull bad: ' + JSON.stringify(pulled) };
        if (local.read('dir/note.md') !== 'push me' || local.read('root.txt') !== 'root content') {
            return { success: false, error: 'pull round-trip content mismatch' };
        }
        return true;
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
});

test('secret hygiene in errors: injected client throwing cannot leak config secrets', async () => {
    const evil = {
        async put() { throw new Error('boom'); },
        async get() { throw new Error('boom'); }
    };
    const s = mkStore(evil, { accessKeyId: 'AKID-visible', secretAccessKey: 'SUPERSECRET' });
    try {
        await s.write('x', 'y');
        return { success: false, error: 'write should throw' };
    } catch (e) {
        if (String(e.message).includes('SUPERSECRET') || String(e.stack || '').includes('SUPERSECRET')) {
            return { success: false, error: 'secret leaked through error path' };
        }
        return true;
    }
});

(async () => {
    await _chain;
    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('\n  FAILURES:');
        failures.forEach(f => console.log('   - ' + f));
    }
    process.exit(results.failed > 0 ? 1 : 0);
})();
