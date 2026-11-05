#!/usr/bin/env node
/**
 * Habitat Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n💨 HABITAT MODULE TESTS\n');

test('habitat module loads', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    return { success: !!h };
});

test('habitat has Habitat class', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    return { success: typeof h === 'function' };
});

test('habitat has getBrainHabitatConfig function', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    return { success: typeof h.getBrainHabitatConfig === 'function' };
});

test('habitat has setBrainHabitatConfig function', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    return { success: typeof h.setBrainHabitatConfig === 'function' };
});

test('habitat has getStackHabitatConfigs function', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    return { success: typeof h.getStackHabitatConfigs === 'function' };
});

test('getStackHabitatConfigs returns object with source stack', () => {
    const h = require(path.join(ROOT, 'lib', 'habitat'));
    const result = h.getStackHabitatConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
