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

test('cache module loads', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: !!cache };
});

test('cache has get function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.get === 'function' };
});

test('cache has set function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.set === 'function' };
});

test('cache has has function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.has === 'function' };
});

test('cache has remove function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.remove === 'function' };
});

test('cache has clear function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.clear === 'function' };
});

test('cache has getStats function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.stats === 'function' };
});

test('cache has compress function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.compress === 'function' };
});

test('cache has decompress function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.decompress === 'function' };
});

test('cache has getLayerStatus function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.getLayerStatus === 'function' };
});

test('cache has isOperationAllowed function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('cache has getBrainCache function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.getBrainCache === 'function' };
});

test('cache has setBrainCache function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.setBrainCache === 'function' };
});

test('cache has clearBrainCache function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.clearBrainCache === 'function' };
});

// Stack tests
test('cache has getStackCacheStats function', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    return { success: typeof cache.getStackCacheStats === 'function' };
});

test('getStackCacheStats returns object with source stack', () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    const result = cache.getStackCacheStats();
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

asyncTest('module-level singleton still works alongside instances', async () => {
    const cache = require(path.join(ROOT, 'lib', 'cache'));
    const { Cache } = require(path.join(ROOT, 'lib', 'cache'));
    const c = new Cache();
    await cache.set('singleton-key', 'singleton');
    await c.set('instance-key', 'instance');
    return {
        success: cache.get('singleton-key') === 'singleton'
            && c.get('instance-key') === 'instance'
            && c.get('singleton-key') === undefined
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
