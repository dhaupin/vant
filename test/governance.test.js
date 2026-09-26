#!/usr/bin/env node
/**
 * Governance Module Unit Tests
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

console.log('\n💨 GOVERNANCE MODULE TESTS\n');

test('governance module loads', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: !!g };
});

test('governance has Governance class', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.Governance === 'function' };
});

test('governance has decide function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.decide === 'function' };
});

test('governance has getBrainGovernanceConfig function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.getBrainGovernanceConfig === 'function' };
});

test('governance has setBrainGovernanceConfig function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.setBrainGovernanceConfig === 'function' };
});

test('governance has getStackGovernanceConfigs function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.getStackGovernanceConfigs === 'function' };
});

test('getStackGovernanceConfigs returns object with source stack', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    const result = g.getStackGovernanceConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
