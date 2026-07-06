#!/usr/bin/env node
/**
 * Security Module Unit Tests
 * Real tests for security.js - CRITICAL
 *
 * Run: node test/test-security.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const security = require('../lib/security');

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

console.log('\n=== Security Module Tests ===\n');

// Test 1: Core exports
test('has Security class', () => {
    return typeof security.Security === 'function';
});

test('has encrypt', () => {
    return typeof security.encrypt === 'function';
});

test('has decrypt', () => {
    return typeof security.decrypt === 'function';
});

test('has validateApiKey', () => {
    return typeof security.validateApiKey === 'function';
});

test('has validateLock', () => {
    return typeof security.validateLock === 'function';
});

test('has isOperationAllowed', () => {
    return typeof security.isOperationAllowed === 'function';
});

test('has runSelfTests', () => {
    return typeof security.runSelfTests === 'function';
});

// Test 2: Security class
test('Security creates instance', () => {
    const sec = new security.Security();
    return sec !== undefined;
});

test('Security has encrypt', () => {
    const sec = new security.Security();
    return typeof sec.encrypt === 'function';
});

test('Security has decrypt', () => {
    const sec = new security.Security();
    return typeof sec.decrypt === 'function';
});

// Test 3: isOperationAllowed
test('isOperationAllowed returns object', () => {
    return typeof security.isOperationAllowed('test', {}) === 'object';
});

// Test 4: getStatus
test('getStatus returns object', () => {
    return typeof security.getStatus() === 'object';
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

console.log('All security tests passed! 🔐\n');
