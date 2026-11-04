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

// Stack tests
test('onboard has getStackOnboardStatus function', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    return { success: typeof onboard.getStackOnboardStatus === 'function' };
});

// (pass 35) getStackOnboardStatus is now async — it awaits per-brain
// summaries instead of storing raw Promises (every brain reported truthy
// hasOnboard before). Sync harness: signature check here, resolution check
// in the async tail below.
test('getStackOnboardStatus returns a Promise (async rework)', () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    const result = onboard.getStackOnboardStatus();
    if (!result || typeof result.then !== 'function') {
        return { success: false, error: 'must return a Promise' };
    }
    return { success: true };
});

(async () => {
    const onboard = require(path.join(ROOT, 'lib', 'onboard'));
    try {
        const r = await onboard.getStackOnboardStatus();
        if (r && r.source === 'stack') {
            results.passed++;
            console.log('  ✓ resolved status has source stack');
        } else {
            results.failed++;
            console.log('  ✗ resolved status missing source: ' + JSON.stringify(r).slice(0, 120));
        }
    } catch (e) {
        results.failed++;
        console.log('  ✗ getStackOnboardStatus rejected: ' + e.message);
    }

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();