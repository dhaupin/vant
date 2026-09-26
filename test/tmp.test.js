#!/usr/bin/env node
/**
 * Tmp Module Unit Tests
 * Tests for tmp (temporary files) functionality with multibrain support
 * 
 * Run: node test/tmp.test.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

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

// v0.9.0-axolotl: async test support for tests that need to await.
const _asyncTests = [];
function asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const t of _asyncTests) {
        try {
            const result = await t.fn();
            if (result === true || (result && result.success)) {
                results.passed++;
                results.tests.push({ name: t.name, status: 'passed' });
                console.log(`  ✓ ${t.name}`);
            } else {
                results.failed++;
                results.tests.push({ name: t.name, status: 'failed', error: result?.error || 'assertion failed' });
                console.log(`  ✗ ${t.name}: ${result?.error || 'assertion failed'}`);
            }
        } catch (e) {
            results.failed++;
            results.tests.push({ name: t.name, status: 'failed', error: e.message });
            console.log(`  ✗ ${t.name}: ${e.message}`);
        }
    }
}

async function _printResults() {
    await _runAsyncTests();
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

    if (results.failed > 0) {
        console.log('\nFailed tests:');
        results.tests.filter(t => t.status === 'failed').forEach(t => {
            console.log(`  - ${t.name}: ${t.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n✓ All tests passed!\n');
        process.exit(0);
    }
}

console.log('\n📁 TMP MODULE TESTS\n');

// Test 1: Module loads
test('tmp module loads', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: !!tmp };
});

// Check what's exported - focus on public API
test('tmp has put function', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: typeof tmp.put === 'function' };
});

test('tmp has get function', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: typeof tmp.get === 'function' };
});

test('tmp has list function', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: typeof tmp.list === 'function' };
});

test('tmp has delete function', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: typeof tmp.delete === 'function' };
});

test('tmp has clear function', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    return { success: typeof tmp.clear === 'function' };
});

// ==================== v0.9.0-axolotl T7 ====================

test('tmp instantiates Cache class directly (T7)', () => {
    // Verify the T7 architectural migration: tmp.js uses `new cacheModule.Cache()`
    // instead of the module-level `defaultCache` singleton.
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'tmp.js'), 'utf8');
    const usesNewCache = /new\s+cacheModule\.Cache\(\s*\)/.test(src) || /new\s+cache\.Cache\(\s*\)/.test(src);
    return {
        success: usesNewCache,
        error: usesNewCache ? null : 'tmp.js does not instantiate Cache class'
    };
});

asyncTest('tmp cacheSet/get still works after T7 refactor', async () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    // Cache.set uses _withLock (async). tmp.cacheSet now returns the underlying
    // promise after the T7 refactor; await it before reading.
    await tmp.cacheSet('axolotl-t7-key', { hello: 'world' });
    const got = tmp.cacheGet('axolotl-t7-key');
    return {
        success: got && got.value && got.value.hello === 'world',
        error: got ? `got: ${JSON.stringify(got)}` : 'no result'
    };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test: tmp integrates with brain module
test('tmp integrates with brain module', () => {
    const tmp = require(path.join(ROOT, 'lib', 'tmp'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test: tmp uses brain path
test('tmp uses brain path', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const brainPath = brain.getBrainPath();
    return { success: !!brainPath };
});

// ============================================
// SUMMARY
// ============================================

_printResults();
