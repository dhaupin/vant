#!/usr/bin/env node
/**
 * Event Module Unit Tests
 *
 * Run: node test/test-event.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const event = require('../lib/event');

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

console.log('\n=== Event Module Tests ===\n');

// Test 1: Core exports
test('has Event class', () => {
    return typeof event.Event === 'function';
});

test('has PubSub class', () => {
    return typeof event.PubSub === 'function';
});

test('has Queue class', () => {
    return typeof event.Queue === 'function';
});

test('has emit function', () => {
    return typeof event.emit === 'function';
});

test('has on function', () => {
    return typeof event.on === 'function';
});

test('has once function', () => {
    return typeof event.once === 'function';
});

test('has off function', () => {
    return typeof event.off === 'function';
});

test('has enqueue function', () => {
    return typeof event.enqueue === 'function';
});

// Test 2: Event instance
test('Event creates instance', () => {
    const em = new event.Event();
    return em !== undefined;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All event tests passed! ✅\n');
