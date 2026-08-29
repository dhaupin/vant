#!/usr/bin/env node
/**
 * Brain Module Unit Tests
 * Real tests for brain.js memory/search
 *
 * Run: node test/test-brain.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const brain = require('../lib/brain');

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

async function asyncTest(name, fn) {
    try {
        const result = await fn();
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

console.log('\n=== Brain Tests ===\n');

// Test 1: Core exports
test('loadBrain alias removed (T11b — nuclear breaking)', () => {
    // v0.9.0-axolotl T11b: loadBrain was a compat alias for _loadBrain.
    // Removed. Use _loadBrain directly (or the unified `read`).
    return {
        success: brain.loadBrain === undefined,
        error: brain.loadBrain !== undefined ? 'loadBrain still exported' : null
    };
});

test('brainList alias removed (T11b — nuclear breaking)', () => {
    // v0.9.0-axolotl T11b: brainList was a compat alias for brainDirs().
    // Removed. Use listBrains() (the new array shape) or brainDirs().
    return {
        success: brain.brainList === undefined,
        error: brain.brainList !== undefined ? 'brainList still exported' : null
    };
});

test('has loadCorpus', () => {
    return typeof brain.loadCorpus === 'function';
});

test('has getMode', () => {
    return typeof brain.getMode === 'function';
});

test('has setMode', () => {
    return typeof brain.setMode === 'function';
});

test('has getBrainPath', () => {
    return typeof brain.getBrainPath === 'function';
});

test('has getPublicPath', () => {
    return typeof brain.getPublicPath === 'function';
});

// Test 2: Mode
test('setMode dual', () => {
    brain.setMode('dual');
    return brain.getMode() === 'dual';
});

test('setMode private', () => {
    brain.setMode('private');
    return brain.getMode() === 'private';
});

test('setMode public', () => {
    brain.setMode('public');
    return brain.getMode() === 'public';
});

// Test 3: Paths
test('getBrainPath returns string', () => {
    const p = brain.getBrainPath();
    return typeof p === 'string' && p.length > 0;
});

test('getPublicPath returns string', () => {
    const p = brain.getPublicPath();
    return typeof p === 'string' && p.length > 0;
});

// Test 4: Load corpus (async)
asyncTest('loadCorpus returns array', async () => {
    const corpus = await brain.loadCorpus();
    return Array.isArray(corpus);
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All brain tests passed! 🎉\n');
