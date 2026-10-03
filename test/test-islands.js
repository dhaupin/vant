#!/usr/bin/env node
/**
 * Islands Module Unit Tests
 * Real tests for islands.js corpus/lazy loading
 *
 * Run: node test/test-islands.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const islands = require('../lib/islands');

// Test results
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

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
// TESTS
// ============================================

console.log('\n=== Islands Tests ===\n');

// Test 1: Core exports
test('has load', () => {
    return typeof islands.load === 'function';
});

test('has save', () => {
    return typeof islands.save === 'function';
});

test('has hydrate', () => {
    return typeof islands.hydrate === 'function';
});

test('has dehydrate', () => {
    return typeof islands.dehydrate === 'function';
});

test('has getHydrated', () => {
    return typeof islands.getHydrated === 'function';
});

test('has getAvailable', () => {
    return typeof islands.getAvailable === 'function';
});

test('has getManifest', () => {
    return typeof islands.getManifest === 'function';
});

// Test 2: Get hydrated
test('getHydrated returns array', () => {
    return Array.isArray(islands.getHydrated());
});

// Test 3: Get available
test('getAvailable returns array', () => {
    return Array.isArray(islands.getAvailable());
});

// Test 4: Get manifest sync (REMOVED — getManifestSync was a test-only
// public API; tests now use the async getManifest via asyncTest in
// test/islands.test.js)// Test 5: Islands class
test('Islands class instantiates', () => {
    const i = new islands.Islands();
    return i !== undefined;
});

test('Islands.getStatus', () => {
    const i = new islands.Islands();
    return typeof i.getStatus() === 'object';
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All islands tests passed! 🎉\n');
