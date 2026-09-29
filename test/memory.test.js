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

(async () => {
    await _runAsyncTests();
    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
