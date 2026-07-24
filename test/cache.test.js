#!/usr/bin/env node
/**
 * Cache Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

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

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);