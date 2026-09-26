#!/usr/bin/env node
/**
 * Nature Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

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

console.log('\n💨 NATURE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('nature module loads', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: !!nature };
});

// ============================================
// EXPORTS
// ============================================

test('nature has Nature class', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature === 'function' };
});

test('nature has Flywheel class', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.Flywheel === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('nature has getBrainNatureConfig function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.getBrainNatureConfig === 'function' };
});

test('nature has setBrainNatureConfig function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.setBrainNatureConfig === 'function' };
});

// Stack tests
test('nature has getStackNatureConfigs function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.getStackNatureConfigs === 'function' };
});

test('getStackNatureConfigs returns object with source stack', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    const result = nature.getStackNatureConfigs();
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
