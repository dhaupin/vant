#!/usr/bin/env node
/**
 * Legal Module Unit Tests
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

console.log('\n💨 LEGAL MODULE TESTS\n');

test('legal module loads', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    return { success: !!l };
});

test('legal has canUse function', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    return { success: typeof l.canUse === 'function' };
});

test('legal has getBrainLegalConfig function', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    return { success: typeof l.getBrainLegalConfig === 'function' };
});

test('legal has setBrainLegalConfig function', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    return { success: typeof l.setBrainLegalConfig === 'function' };
});

test('legal has getStackLegalConfigs function', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    return { success: typeof l.getStackLegalConfigs === 'function' };
});

test('getStackLegalConfigs returns object with source stack', () => {
    const l = require(path.join(ROOT, 'lib', 'legal'));
    const result = l.getStackLegalConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
