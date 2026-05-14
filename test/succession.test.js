#!/usr/bin/env node
/**
 * Succession Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n👑 SUCCESSION MODULE TESTS\n');

test('succession module loads', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: !!succession };
});

test('succession has getConfig function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getConfig === 'function' };
});

test('succession has getTrustLevel function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getTrustLevel === 'function' };
});

test('succession has setTrustLevel function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.setTrustLevel === 'function' };
});

test('succession has getPreviousBrain function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getPreviousBrain === 'function' };
});

test('succession has getCurrentVersion function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getCurrentVersion === 'function' };
});

test('succession has getLedger function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getLedger === 'function' };
});

test('succession has getFilesForTrust function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getFilesForTrust === 'function' };
});

test('succession has logSuccession function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.logSuccession === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);