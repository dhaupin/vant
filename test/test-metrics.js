#!/usr/bin/env node
/**
 * Metrics Module Unit Tests
 *
 * Run: node test/test-metrics.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const metrics = require('../lib/metrics');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

console.log('\n=== Metrics Module Tests ===\n');

// Test 1: Core exports
// (pass 19 bin sweep: aligned with the registry API shipped in 59325b8 —
// inc/setGauge/observe/startTimer/snapshot/reset replaced the old
// increment/gauge/timing/getStats/clear exports. The old names were
// removed with no aliases, so this suite checked ghosts and always failed.)
test('has increment function', () => {
    return typeof metrics.inc === 'function';
});

test('has gauge function', () => {
    return typeof metrics.setGauge === 'function';
});

test('has timing function', () => {
    return typeof metrics.startTimer === 'function';
});

test('has getStats function', () => {
    return typeof metrics.snapshot === 'function';
});

test('has clear function', () => {
    return typeof metrics.reset === 'function';
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All metrics tests passed! ✅\n');
