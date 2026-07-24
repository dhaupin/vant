#!/usr/bin/env node
/**
 * Rules Module Unit Tests
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

console.log('\n💨 RULES MODULE TESTS\n');

test('rules module loads', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: !!r };
});

test('rules has getRules function', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: typeof r.getRules === 'function' };
});

test('rules has check function', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: typeof r.check === 'function' };
});

test('rules has getBrainRulesConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: typeof r.getBrainRulesConfig === 'function' };
});

test('rules has setBrainRulesConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: typeof r.setBrainRulesConfig === 'function' };
});

test('rules has getStackRulesConfigs function', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    return { success: typeof r.getStackRulesConfigs === 'function' };
});

test('getStackRulesConfigs returns object with source stack', () => {
    const r = require(path.join(ROOT, 'lib', 'rules'));
    const result = r.getStackRulesConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
