#!/usr/bin/env node
/**
 * Resolution Module Unit Tests
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

console.log('\n🎯 RESOLUTION MODULE TESTS\n');

test('resolution module loads', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: !!resolution };
});

test('resolution has Resolution class', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: !!resolution.Resolution };
});

test('resolution has create function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.create === 'function' };
});

test('resolution has resolve function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.resolve === 'function' };
});

test('resolution has deprecate function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.deprecate === 'function' };
});

test('resolution has reject function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.reject === 'function' };
});

test('resolution has list function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.list === 'function' };
});

test('resolution has get function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.get === 'function' };
});

test('resolution has isActive function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.isActive === 'function' };
});

test('resolution has getLayerStatus function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.getLayerStatus === 'function' };
});

test('resolution has isOperationAllowed function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.isOperationAllowed === 'function' };
});

test('resolution has getStatus function', () => {
    const resolution = require(path.join(ROOT, 'lib', 'resolution'));
    return { success: typeof resolution.getStatus === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);