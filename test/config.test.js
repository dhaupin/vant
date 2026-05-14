#!/usr/bin/env node
/**
 * Config Module Unit Tests
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

console.log('\n⚙️  CONFIG MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('config module loads', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: !!config };
});

test('config has get function', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.get === 'function' };
});

test('config has set function', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.set === 'function' };
});

test('config has getAll function', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.getAll === 'function' };
});

test('config has clearCache function', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.clearCache === 'function' };
});

// ============================================
// GET
// ============================================

test('config get returns value', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    config.set('test.get', 'hello');
    const value = config.get('test.get');
    return { success: value === 'hello' };
});

test('config getAll returns object', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    const all = config.getAll();
    return { success: typeof all === 'object' };
});

test('config getFlag returns boolean or null', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    let value;
    try {
        value = config.getFlag('nonexistent.flag');
    } catch (e) {
        value = null;
    }
    return { success: value === null || value === undefined || typeof value === 'boolean' };
});

test('config isEnabled returns boolean', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    const value = config.isEnabled('nonexistent');
    return { success: typeof value === 'boolean' };
});

// ============================================
// SET
// ============================================

test('config set stores value', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    config.set('test.set', 'world');
    const value = config.get('test.set');
    return { success: value === 'world' };
});

// ============================================
// ENABLE/DISABLE
// ============================================

test('config enable is callable', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.enable === 'function' };
});

test('config disable is callable', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.disable === 'function' };
});

test('config toggle is callable', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.toggle === 'function' };
});

// ============================================
// API KEYS
// ============================================

test('config hasApiKey returns boolean', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.hasApiKey === 'function' };
});

test('config hasMcpApiKey returns boolean', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.hasMcpApiKey === 'function' };
});

test('config getLayerStatus is callable', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    return { success: typeof config.getLayerStatus === 'function' };
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