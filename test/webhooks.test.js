#!/usr/bin/env node
/**
 * Webhooks Module Unit Tests
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

console.log('\n🪝 WEBHOOKS MODULE TESTS\n');

test('webhooks module loads', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: !!webhooks };
});

test('webhooks has register function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.register === 'function' };
});

test('webhooks has verifySignature function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.verifySignature === 'function' };
});

test('webhooks has addFilter function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.addFilter === 'function' };
});

test('webhooks has matchFilter function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.matchFilter === 'function' };
});

test('webhooks has startServer function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.startServer === 'function' };
});

test('webhooks has send function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.send === 'function' };
});

test('webhooks has sendWebhook function', () => {
    const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
    return { success: typeof webhooks.sendWebhook === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);