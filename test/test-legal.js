#!/usr/bin/env node
/**
 * Legal Module Unit Tests
 * Real tests for legal.js compliance gate
 *
 * Run: node test/test-legal.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const legal = require('../lib/legal');

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

console.log('\n=== Legal Tests ===\n');

// Test 1: Core exports
test('has checkGate', () => {
    return typeof legal.checkGate === 'function';
});

test('has activate', () => {
    return typeof legal.activate === 'function';
});

test('has deactivate', () => {
    return typeof legal.deactivate === 'function';
});

test('has getStatus', () => {
    return typeof legal.getStatus === 'function';
});

test('has notice', () => {
    return typeof legal.notice === 'function';
});

test('has canUse', () => {
    return typeof legal.canUse === 'function';
});

// Test 2: Status
test('getStatus returns object', () => {
    return typeof legal.getStatus() === 'object';
});

// Test 3: Activate
test('activate warn', () => {
    const result = legal.activate('warn');
    return result.activated === true;
});

// Test 4: Check gate
test('checkGate returns', () => {
    return legal.checkGate('test', {}) !== undefined;
});

// Test 5: Notice (logs, returns undefined - expected)
test('notice logs', () => {
    // notice logs to console but returns undefined
    const result = legal.notice('info', 'test message');
    return result === undefined;
});

// Test 6: Deactivate
test('deactivate', () => {
    const result = legal.deactivate();
    return result.deactivated === true;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All legal tests passed! 🎉\n');
