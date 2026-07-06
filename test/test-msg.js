#!/usr/bin/env node
/**
 * Msg Module Unit Tests
 *
 * Run: node test/test-msg.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const msg = require('../lib/msg');

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

console.log('\n=== Msg Module Tests ===\n');

// Test 1: Core exports
test('has Msg class', () => {
    return typeof msg.Msg === 'function';
});

test('has send function', () => {
    return typeof msg.send === 'function';
});

test('has subscribe function', () => {
    return typeof msg.subscribe === 'function';
});

test('has publish function', () => {
    return typeof msg.publish === 'function';
});

test('has create function', () => {
    return typeof msg.create === 'function';
});

test('has join function', () => {
    return typeof msg.join === 'function';
});

test('has post function', () => {
    return typeof msg.post === 'function';
});

test('has reply function', () => {
    return typeof msg.reply === 'function';
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All msg tests passed! ✅\n');
