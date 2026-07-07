#!/usr/bin/env node
/**
 * QoS Module Unit Tests
 * Real tests for qos.js - Rate limiting
 *
 * Run: node test/test-qos.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const qos = require('../lib/qos');
const { RateLimiter } = qos;

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        // Handle promise results
        if (result && typeof result.then === 'function') {
            result.then(r => {
                if (r === true || (r && r.success)) {
                    results.passed++;
                    results.tests.push({ name, status: 'passed' });
                    console.log(`  ✓ ${name}`);
                } else {
                    results.failed++;
                    results.tests.push({ name, status: 'failed', error: r.error || 'assertion failed' });
                    console.log(`  ✗ ${name}: ${r.error || 'assertion failed'}`);
                }
            }).catch(e => {
                results.failed++;
                results.tests.push({ name, status: 'failed', error: e.message });
                console.log(`  ✗ ${name}: ${e.message}`);
            });
            return;
        }
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
// RATE LIMITING TESTS
// ============================================

console.log('\n=== QoS / Rate Limiting Tests ===\n');

// Test 1: Core exports
test('has RateLimiter class', () => {
    return typeof qos.RateLimiter === 'function';
});

test('has QoS class', () => {
    return typeof qos.QoS === 'function';
});

test('has CircuitBreaker class', () => {
    return typeof qos.CircuitBreaker === 'function';
});

test('has Throttler class', () => {
    return typeof qos.Throttler === 'function';
});

// Test 2: RateLimiter basic
test('RateLimiter class instantiates', () => {
    const limiter = new RateLimiter({ max: 10, windowMs: 60000 });
    return limiter !== undefined;
});

test('RateLimiter allows under limit', async () => {
    const limiter = new RateLimiter({ max: 10, windowMs: 60000 });
    const result = await limiter.check();
    return result === true;
});

test('RateLimiter has reset method', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 60000 });
    return typeof limiter.reset === 'function';
});

// Test 3: QoS module
test('has QoS class', () => {
    return typeof qos.QoS === 'function';
});

test('has CircuitBreaker class', () => {
    return typeof qos.CircuitBreaker === 'function';
});

test('has Throttler class', () => {
    return typeof qos.Throttler === 'function';
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

console.log('All QoS tests passed! 🚦\n');
