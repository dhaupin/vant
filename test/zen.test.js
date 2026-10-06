#!/usr/bin/env node
/**
 * Zen Module Unit Tests
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

console.log('\n💨 ZEN MODULE TESTS\n');

test('zen module loads', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: !!z };
});

test('zen has Ohm class', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: typeof z.Ohm === 'function' };
});

test('zen has createOhm function', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: typeof z.createOhm === 'function' };
});

test('zen has getBrainZenConfig function', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: typeof z.getBrainZenConfig === 'function' };
});

test('zen has setBrainZenConfig function', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: typeof z.setBrainZenConfig === 'function' };
});

test('zen has getStackZenConfigs function', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    return { success: typeof z.getStackZenConfigs === 'function' };
});

test('getStackZenConfigs returns object with source stack', () => {
    const z = require(path.join(ROOT, 'lib', 'zen'));
    const result = z.getStackZenConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
