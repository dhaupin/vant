#!/usr/bin/env node
/**
 * Stream Module Unit Tests
 *
 * Run: node test/test-stream.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const stream = require('../lib/stream');

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

console.log('\n=== Stream Module Tests ===\n');

// Test 1: Core exports
test('has init function', () => {
    return typeof stream.init === 'function';
});

test('has enqueue function', () => {
    return typeof stream.enqueue === 'function';
});

test('has poll function', () => {
    return typeof stream.poll === 'function';
});

test('has complete function', () => {
    return typeof stream.complete === 'function';
});

test('has fail function', () => {
    return typeof stream.fail === 'function';
});

test('has list function', () => {
    return typeof stream.list === 'function';
});

test('has create function', () => {
    return typeof stream.create === 'function';
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All stream tests passed! ✅\n');
