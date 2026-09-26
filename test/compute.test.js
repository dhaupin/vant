#!/usr/bin/env node
/**
 * Compute Module Unit Tests
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

console.log('\n💨 COMPUTE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('compute module loads', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: !!compute };
});

// ============================================
// EXPORTS
// ============================================

test('compute has invoke function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.invoke === 'function' };
});

test('compute has status function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.status === 'function' };
});

test('compute has list function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.list === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('compute has getBrainComputeConfig function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.getBrainComputeConfig === 'function' };
});

test('compute has setBrainComputeConfig function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.setBrainComputeConfig === 'function' };
});

// Stack tests
test('compute has getStackComputeConfigs function', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    return { success: typeof compute.getStackComputeConfigs === 'function' };
});

test('getStackComputeConfigs returns object with source stack', () => {
    const compute = require(path.join(ROOT, 'lib', 'compute'));
    const result = compute.getStackComputeConfigs();
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
