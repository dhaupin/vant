#!/usr/bin/env node
/**
 * Tmp Module Unit Tests
 *
 * Run: node test/test-tmp.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const tmp = require('../lib/tmp');

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

console.log('\n=== Tmp Module Tests ===\n');

// Test 1: Core exports
test('has put function', () => {
    return typeof tmp.put === 'function';
});

test('has get function', () => {
    return typeof tmp.get === 'function';
});

test('has list function', () => {
    return typeof tmp.list === 'function';
});

test('has delete function', () => {
    return typeof tmp.delete === 'function';
});

test('has clear function', () => {
    return typeof tmp.clear === 'function';
});

test('has TmpSpace class', () => {
    return typeof tmp.TmpSpace === 'function';
});

test('has cacheSet function', () => {
    return typeof tmp.cacheSet === 'function';
});

test('has cacheGet function', () => {
    return typeof tmp.cacheGet === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All tmp tests passed! ✅\n');
