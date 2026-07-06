#!/usr/bin/env node
/**
 * Boot Module Unit Tests - CRITICAL
 * Tests for initialization and hydration
 *
 * Run: node test/test-boot.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const boot = require('../lib/boot');

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

console.log('\n=== Boot Module Tests (CRITICAL) ===\n');

// Test 1: Core exports
test('has init function', () => {
    return typeof boot.init === 'function';
});

test('has getStatus function', () => {
    return typeof boot.getStatus === 'function';
});

test('has isInitialized function', () => {
    return typeof boot.isInitialized === 'function';
});

test('has reset function', () => {
    return typeof boot.reset === 'function';
});

test('has boot function', () => {
    return typeof boot.boot === 'function';
});

test('has hydrate function', () => {
    return typeof boot.hydrate === 'function';
});

test('has getAvailable function', () => {
    return typeof boot.getAvailable === 'function';
});

test('has getHydrated function', () => {
    return typeof boot.getHydrated === 'function';
});

test('has getManifest function', () => {
    return typeof boot.getManifest === 'function';
});

// Test 2: getStatus returns object
test('getStatus returns object', () => {
    return typeof boot.getStatus() === 'object';
});

test('isInitialized returns boolean', () => {
    return typeof boot.isInitialized() === 'boolean';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All boot tests passed! 🚀\n');
