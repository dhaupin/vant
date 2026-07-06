#!/usr/bin/env node
/**
 * Webhooks Module Unit Tests
 *
 * Run: node test/test-webhooks.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const webhooks = require('../lib/webhooks');

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

console.log('\n=== Webhooks Module Tests ===\n');

// Test 1: Core exports
test('has register function', () => {
    return typeof webhooks.register === 'function';
});

test('has verifySignature function', () => {
    return typeof webhooks.verifySignature === 'function';
});

test('has addFilter function', () => {
    return typeof webhooks.addFilter === 'function';
});

test('has matchFilter function', () => {
    return typeof webhooks.matchFilter === 'function';
});

test('has startServer function', () => {
    return typeof webhooks.startServer === 'function';
});

test('has send function', () => {
    return typeof webhooks.send === 'function';
});

test('has sendWebhook function', () => {
    return typeof webhooks.sendWebhook === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All webhooks tests passed! ✅\n');
