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
test('has increment function', () => {
    return typeof metrics.increment === 'function';
});

test('has gauge function', () => {
    return typeof metrics.gauge === 'function';
});

test('has timing function', () => {
    return typeof metrics.timing === 'function';
});

test('has getStats function', () => {
    return typeof metrics.getStats === 'function';
});

test('has clear function', () => {
    return typeof metrics.clear === 'function';
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All metrics tests passed! ✅\n');
