#!/usr/bin/env node
/**
 * Sudo Module Unit Tests
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

console.log('\n💨 SUDO MODULE TESTS\n');

test('sudo module loads', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: !!s };
});

test('sudo has can function', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: typeof s.can === 'function' };
});

test('sudo has lock function', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: typeof s.lock === 'function' };
});

test('sudo has getBrainSudoConfig function', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: typeof s.getBrainSudoConfig === 'function' };
});

test('sudo has setBrainSudoConfig function', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: typeof s.setBrainSudoConfig === 'function' };
});

test('sudo has getStackSudoConfigs function', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    return { success: typeof s.getStackSudoConfigs === 'function' };
});

test('getStackSudoConfigs returns object with source stack', () => {
    const s = require(path.join(ROOT, 'lib', 'sudo'));
    const result = s.getStackSudoConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
