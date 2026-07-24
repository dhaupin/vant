#!/usr/bin/env node
/**
 * Encounter Module Unit Tests
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

console.log('\n💨 ENCOUNTER MODULE TESTS\n');

test('encounter module loads', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    return { success: !!e };
});

test('encounter has Encounter class', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    return { success: typeof e.Encounter === 'function' };
});

test('encounter has getBrainEncounterConfig function', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    return { success: typeof e.getBrainEncounterConfig === 'function' };
});

test('encounter has setBrainEncounterConfig function', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    return { success: typeof e.setBrainEncounterConfig === 'function' };
});

test('encounter has getStackEncounterConfigs function', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    return { success: typeof e.getStackEncounterConfigs === 'function' };
});

test('getStackEncounterConfigs returns object with source stack', () => {
    const e = require(path.join(ROOT, 'lib', 'encounter'));
    const result = e.getStackEncounterConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
