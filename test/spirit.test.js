#!/usr/bin/env node
/**
 * Spirit Module Unit Tests
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

console.log('\n💨 SPIRIT MODULE TESTS\n');

test('spirit module loads', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: !!s };
});

test('spirit has verify function', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: typeof s.verify === 'function' };
});

test('spirit has quarantine function', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: typeof s.quarantine === 'function' };
});

test('spirit has getBrainSpiritConfig function', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: typeof s.getBrainSpiritConfig === 'function' };
});

test('spirit has setBrainSpiritConfig function', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: typeof s.setBrainSpiritConfig === 'function' };
});

test('spirit has getStackSpiritConfigs function', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    return { success: typeof s.getStackSpiritConfigs === 'function' };
});

test('getStackSpiritConfigs returns object with source stack', () => {
    const s = require(path.join(ROOT, 'lib', 'spirit'));
    const result = s.getStackSpiritConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
