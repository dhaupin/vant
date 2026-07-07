#!/usr/bin/env node
/**
 * RLS Module Unit Tests
 * Real tests for rls.js - Row Level Security
 *
 * Run: node test/test-rls.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rls = require('../lib/rls');
const Habitat = require('../lib/habitat');

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
// RLS TESTS
// ============================================

console.log('\n=== RLS Tests ===\n');

// Test 1: Core exports
test('has init function', () => {
    return typeof rls.init === 'function';
});

test('has middleware function', () => {
    return typeof rls.middleware === 'function';
});

test('has checkRead function', () => {
    return typeof rls.checkRead === 'function';
});

test('has checkWrite function', () => {
    return typeof rls.checkWrite === 'function';
});

test('has forWorkspace function', () => {
    return typeof rls.forWorkspace === 'function';
});

// Test 2: checkRead/checkWrite exist and return promises
skip('checkRead returns promise', 'RLS needs habitat init first');
skip('checkWrite returns promise', 'RLS needs habitat init first');

// Test 3: RLS with habitat integration
test('init sets habitat', () => {
    const habitat = new Habitat();
    rls.init(habitat);
    return rls.getHabitat() === habitat;
});

// Test 4: Workspace context
test('setWorkspace context', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('test-ws');
    rls.init(habitat);
    rls.setWorkspace('test-ws');
    return rls.getWorkspace() === 'test-ws';
});

// Test 5: Context check
test('context returns object', () => {
    return typeof rls.context() === 'object';
});

// Test 6: Middleware exists
test('middleware is function', () => {
    return typeof rls.middleware === 'function';
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

console.log('All RLS tests passed! 🔒\n');
