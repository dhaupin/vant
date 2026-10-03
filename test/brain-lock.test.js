#!/usr/bin/env node
/**
 * Brain Lock Module Unit Tests (lib/brain-lock.js)
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

console.log('\n🔒 BRAIN LOCK MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('brain-lock module loads', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: !!lock };
});

test('brain-lock has acquireBrainLock function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.acquireBrainLock === 'function' };
});

test('brain-lock has releaseBrainLock function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.releaseBrainLock === 'function' };
});

test('brain-lock has brainLockStatus function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.brainLockStatus === 'function' };
});

test('brain-lock has forceReleaseBrainLock function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.forceReleaseBrainLock === 'function' };
});

test('brain-lock has getAgentId function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.getAgentId === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('brain-lock has getStackLockStatus function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.getStackLockStatus === 'function' };
});

test('brain-lock has listStackLocks function', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    return { success: typeof lock.listStackLocks === 'function' };
});

test('getStackLockStatus returns object with source stack', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
    const status = lock.getStackLockStatus();
    return { success: status && status.source === 'stack' };
});

test('listStackLocks returns array', () => {
    const lock = require(path.join(ROOT, 'lib', 'brain-lock'));
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
