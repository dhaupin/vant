#!/usr/bin/env node
/**
 * Audit Module Unit Tests
 *
 * Run: node test/test-audit.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const audit = require('../lib/audit');

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

console.log('\n=== Audit Module Tests ===\n');

// Test 1: Core exports
test('has log function', () => {
    return typeof audit.log === 'function';
});

test('has query function', () => {
    return typeof audit.query === 'function';
});

test('has getLedger function', () => {
    return typeof audit.getLedger === 'function';
});

test('has search function', () => {
    return typeof audit.search === 'function';
});

test('has batch function', () => {
    return typeof audit.batch === 'function';
});

// Test 2: Logging levels
test('has info function', () => {
    return typeof audit.info === 'function';
});

test('has warn function', () => {
    return typeof audit.warn === 'function';
});

test('has error function', () => {
    return typeof audit.error === 'function';
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All audit tests passed! ✅\n');
