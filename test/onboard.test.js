#!/usr/bin/env node
/**
 * Onboard Module Unit Tests
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

console.log('\n🎯 ONBOARD MODULE TESTS\n');

test('onboard module loads', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: !!onboard };
});

test('onboard has getBrainFiles function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getBrainFiles === 'function' };
});

test('onboard has getSystemFiles function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getSystemFiles === 'function' };
});

test('onboard has getFileInfo function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getFileInfo === 'function' };
});

test('onboard has getOnboardSummary function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getOnboardSummary === 'function' };
});

test('onboard has getFile function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getFile === 'function' };
});

test('onboard has search function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.search === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);