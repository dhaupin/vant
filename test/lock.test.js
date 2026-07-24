#!/usr/bin/env node
/**
 * Lock Module Unit Tests
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

console.log('\n🔒 LOCK MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('lock module loads', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: !!lock };
});

test('lock has acquire function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.acquire === 'function' };
});

test('lock has release function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.release === 'function' };
});

test('lock has status function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.status === 'function' };
});

test('lock has forceRelease function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.forceRelease === 'function' };
});

test('lock has getAgentId function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.getAgentId === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('lock has getStackLockStatus function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.getStackLockStatus === 'function' };
});

test('lock has listStackLocks function', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    return { success: typeof lock.listStackLocks === 'function' };
});

test('getStackLockStatus returns object with source stack', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    const status = lock.getStackLockStatus();
    return { success: status && status.source === 'stack' };
});

test('listStackLocks returns array', () => {
    const lock = require(path.join(ROOT, 'lib', 'lock'));
    const locks = lock.listStackLocks();
    return { success: Array.isArray(locks) };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);