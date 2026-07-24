#!/usr/bin/env node
/**
 * Storage Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
const _asyncTests = [];

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

async function asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const { name, fn } of _asyncTests) {
        try {
            const result = await fn();
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
}

console.log('\n💾 STORAGE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('storage module loads', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage };
});

test('storage has get function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.get === 'function' };
});

test('storage has FileStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.FileStorage };
});

test('storage has BrainStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.BrainStorage };
});

test('storage has VectorStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.VectorStorage };
});

test('storage has ConfigStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.ConfigStorage };
});

test('storage has version', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.version === 'string' };
});

test('storage has getLayerStatus', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getLayerStatus === 'function' };
});

test('storage has isOperationAllowed', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.isOperationAllowed === 'function' };
});

test('storage has getStatus', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getStatus === 'function' };
});

// ============================================
// GET
// ============================================

test('storage.get works for brain type', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const brain = Storage.get('brain');
    return { success: !!brain || brain === null };
});

test('storage.get works for vector type', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const vector = Storage.get('vector');
    return { success: !!vector || vector === null };
});

// ============================================
// STATUS
// ============================================

test('getStatus returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const status = Storage.getStatus();
    return { success: typeof status === 'object' };
});

test('getLayerStatus returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const status = Storage.getLayerStatus();
    return { success: typeof status === 'object' };
});

// ============================================
// PERMISSIONS
// ============================================

test('isOperationAllowed returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const result = Storage.isOperationAllowed('read');
    return { success: typeof result === 'object' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('storage has listStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.listStack === 'function' };
});

test('storage has readStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.readStack === 'function' };
});

test('storage has existsStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.existsStack === 'function' };
});

test('storage has getStackStats function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getStackStats === 'function' };
});

test('listStack returns array', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const files = Storage.listStack();
    return { success: Array.isArray(files) };
});

test('existsStack returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const result = Storage.existsStack('nonexistent');
    return { success: typeof result === 'object' };
});

test('getStackStats returns object with source stack', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const stats = Storage.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

async function _printResults() {
    await _runAsyncTests();
    
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

    process.exit(results.failed > 0 ? 1 : 0);
}

_printResults();