#!/usr/bin/env node
/**
 * Cache Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
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

console.log('\n💨 CACHE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================
// v0.9.0-axolotl T13b: legacy module-singleton API tests removed.
// The singleton + 25+ proxy exports are gone; canonical usage is
// `const { Cache } = require('./cache'); new Cache()`. See the
// "v0.9.0-axolotl CACHE CLASS" block below for the new tests.
// ============================================

// Stack tests (T13b — instances, not module singleton)
test('Cache instance has getStackCacheStats function', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    return { success: typeof c.getStackCacheStats === 'function' };
});

test('getStackCacheStats returns object with source stack', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    const result = c.getStackCacheStats();
    return { success: result && result.source === 'stack' };
});

// ==================== v0.9.0-axolotl CACHE CLASS ====================

test('cache module exposes Cache class', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.Cache === 'function' };
});

test('new Cache() returns an instance', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    return { success: c instanceof Cache };
});

test('new Cache() accepts options', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache({ maxSize: 50, defaultTTL: 5000, enableCompression: false });
    const cfg = c.configure();
    return {
        success: cfg.maxSize === 50 && cfg.defaultTTL === 5000 && cfg.enableCompression === false
    };
});

asyncTest('new Cache() instance has isolated state', async () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const a = new Cache();
    const b = new Cache();
    await a.set('shared', 'A');
    await b.set('shared', 'B');
    return {
        success: a.get('shared') === 'A' && b.get('shared') === 'B' && a.size() === 1 && b.size() === 1
    };
});

asyncTest('instance clear does not affect other instances', async () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const a = new Cache();
    const b = new Cache();
    await a.set('k', 'v');
    await b.set('k', 'v');
    a.clear();
    return { success: a.size() === 0 && b.size() === 1 && b.get('k') === 'v' };
});

test('instance has pipeline getter', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    // lazy loaded; may be null in test env without pipeline but should not throw
    return { success: 'pipeline' in c };
});

test('instance has Secured variants', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    return {
        success: typeof c.setSecured === 'function'
            && typeof c.getSecured === 'function'
            && typeof c.removeSecured === 'function'
            && typeof c.clearSecured === 'function'
    };
});

asyncTest('instance supports compression and decompression', async () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    const data = 'hello world '.repeat(100);
    const compressed = c.compress(data);
    const decompressed = c.decompress(compressed);
    return { success: decompressed.toString() === data && compressed.length < data.length };
});

test('instance has its own buffer pool', () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const a = new Cache();
    const b = new Cache();
    a.createPool('test', { size: 4, bufferSize: 1024 });
    const bufA = a.acquire('test');
    const bufB = b.acquire('test');  // b doesn't have a 'test' pool, gets auto-created
    return { success: bufA !== null && bufB !== null && bufA !== bufB };
});

// v0.9.0-axolotl T13b: the module-level `defaultCache` singleton is gone.
// Two instances are now fully isolated (proves there's no shared state).
asyncTest('two Cache instances are fully isolated (no module singleton)', async () => {
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const a = new Cache();
    const b = new Cache();
    await a.set('iso-key', 'in-a');
    await b.set('iso-key', 'in-b');
    return {
        success: a.get('iso-key') === 'in-a'
            && b.get('iso-key') === 'in-b'
            && a.get('isolation-foo') === undefined
            && b.get('isolation-foo') === undefined
    };
});

// ============================================
// SUMMARY (synchronous tests above; async tests below)
// ============================================

async function _printResults() {
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
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);

    process.exit(results.failed > 0 ? 1 : 0);
}

_printResults();
