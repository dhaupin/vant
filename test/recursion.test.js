#!/usr/bin/env node
/**
 * Recursion Module Unit Tests
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

console.log('\n💨 RECURSION MODULE TESTS\n');

test('recursion module loads', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: !!r };
});

test('recursion has guard function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.guard === 'function' };
});

test('recursion has getBrainRecursionConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.getBrainRecursionConfig === 'function' };
});

test('recursion has setBrainRecursionConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.setBrainRecursionConfig === 'function' };
});

test('recursion has getStackRecursionConfigs function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.getStackRecursionConfigs === 'function' };
});

test('getStackRecursionConfigs returns object with source stack', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    const result = r.getStackRecursionConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
