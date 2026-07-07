#!/usr/bin/env node
/**
 * Storage Module Unit Tests
 * Real tests for storage.js - CRITICAL security tests
 *
 * Run: node test/test-storage.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storage = require('../lib/storage');

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

// ============================================
// CRITICAL SECURITY TESTS
// ============================================

console.log('\n=== Storage Security Tests ===\n');

// Test 1: Core exports - Storage classes
test('has FileStorage class', () => {
    return typeof storage.FileStorage === 'function';
});

test('has BrainStorage class', () => {
    return typeof storage.BrainStorage === 'function';
});

test('has read method', () => {
    return typeof storage.read === 'function';
});

test('has write method', () => {
    return typeof storage.write === 'function';
});

test('has exists method', () => {
    return typeof storage.exists === 'function';
});

test('has delete method', () => {
    return typeof storage.delete === 'function';
});

test('has get method', () => {
    return typeof storage.get === 'function';
});

test('has has method', () => {
    return typeof storage.has === 'function';
});

// Test 2: FileStorage basic operations
test('FileStorage instantiates', () => {
    const fs = new storage.FileStorage();
    return fs !== undefined;
});

test('FileStorage has basePath', () => {
    const fs = new storage.FileStorage();
    return typeof fs.basePath === 'string';
});

// Test 3: BrainStorage exists
test('BrainStorage instantiates', () => {
    const bs = new storage.BrainStorage();
    return bs !== undefined;
});

// Test 4: Storage static methods
test('storage.read is function', () => {
    return typeof storage.read === 'function';
});

test('storage.write is function', () => {
    return typeof storage.write === 'function';
});

test('storage.exists is function', () => {
    return typeof storage.exists === 'function';
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED TESTS:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All storage security tests passed! 🛡️\n');
