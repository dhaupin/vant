#!/usr/bin/env node
/**
 * Consciousness Module Unit Tests
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

console.log('\n💨 CONSCIOUSNESS MODULE TESTS\n');

test('consciousness module loads', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    return { success: !!c };
});

test('consciousness has intend function', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    return { success: typeof c.intend === 'function' };
});

test('consciousness has getBrainConsciousnessConfig function', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    return { success: typeof c.getBrainConsciousnessConfig === 'function' };
});

test('consciousness has setBrainConsciousnessConfig function', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    return { success: typeof c.setBrainConsciousnessConfig === 'function' };
});

test('consciousness has getStackConsciousnessConfigs function', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    return { success: typeof c.getStackConsciousnessConfigs === 'function' };
});

test('getStackConsciousnessConfigs returns object with source stack', () => {
    const c = require(path.join(ROOT, 'lib', 'consciousness'));
    const result = c.getStackConsciousnessConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
