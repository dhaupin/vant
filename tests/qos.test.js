#!/usr/bin/env node
/**
 * QoS Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🎯 QOS MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('qos module loads', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: !!qos };
});

test('qos has Throttler', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: !!qos.Throttler };
});

test('qos has Debouncer', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: !!qos.Debouncer };
});

test('qos has Bulkhead', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: !!qos.Bulkhead };
});

test('qos has getStatus function', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: typeof qos.getStatus === 'function' };
});

// ============================================
// CONSTRUCTORS
// ============================================

test('CircuitBreaker is constructor', () => {
    const { CircuitBreaker } = require(path.join(ROOT, 'lib', 'qos'));
    return { success: typeof CircuitBreaker === 'function' };
});

test('RateLimiter is constructor', () => {
    const { RateLimiter } = require(path.join(ROOT, 'lib', 'qos'));
    return { success: typeof RateLimiter === 'function' };
});

test('Throttler is constructor', () => {
    const { Throttler } = require(path.join(ROOT, 'lib', 'qos'));
    return { success: typeof Throttler === 'function' };
});

// ============================================
// STACK TESTS
// ============================================

test('qos has getStackQoSStatus function', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    return { success: typeof qos.getStackQoSStatus === 'function' };
});

test('getStackQoSStatus returns object with source stack', () => {
    const qos = require(path.join(ROOT, 'lib', 'qos'));
    const result = qos.getStackQoSStatus();
    return { success: result && result.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);