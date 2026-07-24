#!/usr/bin/env node
/**
 * Relay Module Unit Tests
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

console.log('\n💨 RELAY MODULE TESTS\n');

test('relay module loads', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: !!r };
});

test('relay has Relay class', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: typeof r.Relay === 'function' };
});

test('relay has createRelay function', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: typeof r.createRelay === 'function' };
});

test('relay has getBrainRelayConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: typeof r.getBrainRelayConfig === 'function' };
});

test('relay has setBrainRelayConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: typeof r.setBrainRelayConfig === 'function' };
});

test('relay has getStackRelayConfigs function', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    return { success: typeof r.getStackRelayConfigs === 'function' };
});

test('getStackRelayConfigs returns object with source stack', () => {
    const r = require(path.join(ROOT, 'lib', 'relay'));
    const result = r.getStackRelayConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
