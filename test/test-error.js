#!/usr/bin/env node
/**
 * Error Module Unit Tests
 *
 * Run: node test/test-error.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const error = require('../lib/error');

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

console.log('\n=== Error Module Tests ===\n');

// Test 1: Core exports
test('has Error class', () => {
    return typeof error.Error === 'function';
});

test('has VantError class', () => {
    return typeof error.VantError === 'function';
});

test('has CODES object', () => {
    return typeof error.CODES === 'object';
});

test('has handle function', () => {
    return typeof error.handle === 'function';
});

test('has retry function', () => {
    return typeof error.retry === 'function';
});

// Test 2: VantError creation
test('VantError creates instance', () => {
    const err = new error.VantError();
    return err instanceof Error;
});

test('VantError has code property', () => {
    const err = new error.VantError();
    return 'code' in err;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All error tests passed! ✅\n');
