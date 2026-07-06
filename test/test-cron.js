#!/usr/bin/env node
/**
 * Cron Module Unit Tests
 *
 * Run: node test/test-cron.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cron = require('../lib/cron');

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

console.log('\n=== Cron Module Tests ===\n');

// Test 1: Core exports
test('has schedule function', () => {
    return typeof cron.schedule === 'function';
});

test('has cancel function', () => {
    return typeof cron.cancel === 'function';
});

test('has run function', () => {
    return typeof cron.run === 'function';
});

test('has status function', () => {
    return typeof cron.status === 'function';
});

test('has list function', () => {
    return typeof cron.list === 'function';
});

test('has enable function', () => {
    return typeof cron.enable === 'function';
});

test('has once function', () => {
    return typeof cron.once === 'function';
});

test('has JobWorker class', () => {
    return typeof cron.JobWorker === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All cron tests passed! ✅\n');
