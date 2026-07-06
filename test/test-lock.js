#!/usr/bin/env node
/**
 * Lock Module Unit Tests
 *
 * Run: node test/test-lock.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const lock = require('../lib/lock');

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

console.log('\n=== Lock Module Tests ===\n');

// Test 1: Core exports
test('has acquire function', () => {
    return typeof lock.acquire === 'function';
});

test('has release function', () => {
    return typeof lock.release === 'function';
});

test('has status function', () => {
    return typeof lock.status === 'function';
});

test('has forceRelease function', () => {
    return typeof lock.forceRelease === 'function';
});

test('has getAgentId function', () => {
    return typeof lock.getAgentId === 'function';
});

console.log('\n=== Results: %d passed, %d failed, %d skipped ===\n', results.passed, results.failed, results.skipped);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All lock tests passed! ✅\n');
