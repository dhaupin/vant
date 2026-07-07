#!/usr/bin/env node
/**
 * Compute Module Unit Tests
 *
 * Run: node test/test-compute.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const compute = require('../lib/compute');

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

console.log('\n=== Compute Module Tests ===\n');

// Test 1: Core exports
test('has Compute class', () => {
    return typeof compute.Compute === 'function';
});

test('has run function', () => {
    return typeof compute.run === 'function';
});

test('has invoke function', () => {
    return typeof compute.invoke === 'function';
});

test('has eval function', () => {
    return typeof compute.eval === 'function';
});

test('has status function', () => {
    return typeof compute.status === 'function';
});

test('has list function', () => {
    return typeof compute.list === 'function';
});

// Test 2: Connectors available
test('has python connector', () => {
    return typeof compute.python === 'function';
});

test('list returns connectors', () => {
    const connectors = compute.list();
    return Array.isArray(connectors) && connectors.length > 0;
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All compute tests passed! ✅\n');
