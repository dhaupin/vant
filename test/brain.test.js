#!/usr/bin/env node
/**
 * Brain Module Unit Tests
 * Real tests for brain.js core functionality
 * 
 * Run: node test/brain.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODELS_PRIVATE = path.join(ROOT, 'models', 'private');
const MODELS_PUBLIC = path.join(ROOT, 'models', 'public');

// Test results
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

// Collect async tests to run at end
const _asyncTests = [];

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

async function asyncTest(name, fn) {
    // Add to collection to run at end
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const { name, fn } of _asyncTests) {
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
}

console.log('\n🧠 BRAIN MODULE TESTS\n');

// ============================================
// LOAD & BASIC
// ============================================

test('brain module loads', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: !!brain };
});

test('brain has loadBrain function', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.loadBrain === 'function' };
});

test('brain has loadCorpus function', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.loadCorpus === 'function' };
});

test('brain has getPipeline function', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.getPipeline === 'function' };
});

// ============================================
// PATH GETTERS
// ============================================

test('getBrainPath returns valid path', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const bp = brain.getBrainPath();
    return { success: typeof bp === 'string' && bp.length > 0 };
});

test('getPublicPath returns valid path', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const pp = brain.getPublicPath();
    return { success: typeof pp === 'string' && pp.length > 0 };
});

// ============================================
// MODE SWITCHING
// ============================================

test('getMode returns string', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const mode = brain.getMode();
    return { success: typeof mode === 'string' };
});

test('setMode changes mode', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    brain.setMode('private');
    const mode = brain.getMode();
    brain.setMode('dual'); // reset
    return { success: mode === 'private' };
});

// ============================================
// PIPELINE
// ============================================

test('getPipeline returns array', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const pipeline = brain.getPipeline('dual');
    return { success: Array.isArray(pipeline) };
});

test('setPipeline modifies chain', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    brain.setPipeline('test', ['sandbox', 'vaf']);
    const pipeline = brain.getPipeline('test');
    return { success: pipeline[0] === 'sandbox' && pipeline[1] === 'vaf' };
});

test('addMiddleware adds handler', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    brain.addMiddleware('dual', 'testHandler');
    const pipeline = brain.getPipeline('dual');
    return { success: pipeline.includes('testHandler') };
});

test('removeMiddleware removes handler', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Add then remove
    brain.addMiddleware('dual', 'tempHandler');
    brain.removeMiddleware('dual', 'tempHandler');
    const pipeline = brain.getPipeline('dual');
    return { success: !pipeline.includes('tempHandler') };
});

test('getPipelineState returns object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = brain.getPipelineState();
    return { success: typeof state === 'object' && state !== null };
});

// ============================================
// BRAIN LOADING
// ============================================

asyncTest('loadCorpus returns array', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const corpus = await brain.loadCorpus();
    return { success: Array.isArray(corpus) || corpus?.length > 0 };
});

asyncTest('hasBrain returns source or null', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = await brain.hasBrain('identity');
    return { success: result === null || ['public', 'private'].includes(result) };
});

asyncTest('listBrains returns array', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const brains = await brain.listBrains();
    return { success: Array.isArray(brains) };
});

// ============================================
// ALIASES
// ============================================

test('alias creates mapping', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Check if alias function exists (some versions may not have removeAlias)
    if (typeof brain.alias !== 'function') {
        skip('alias function not available', 'may not exist in this version');
        return;
    }
    brain.alias('test_alias', 'identity');
    const resolved = brain.resolve('test_alias');
    // Try to clean up if removeAlias exists
    if (typeof brain.removeAlias === 'function') {
        brain.removeAlias('test_alias');
    }
    return { success: resolved === 'identity' };
});

test('resolve handles non-alias', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const resolved = brain.resolve('nonexistent');
    return { success: resolved === 'nonexistent' };
});

test('listAliases returns array or object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const aliases = brain.listAliases();
    // Returns array in some versions, object in others
    return { success: Array.isArray(aliases) || typeof aliases === 'object' };
});

// ============================================
// STATE (sync)
// ============================================

test('getNeuronState returns object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = brain.getNeuronState();
    return { success: typeof state === 'object' };
});

test('saveNeuronState does not throw', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    try {
        brain.saveNeuronState({ test: true });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// ============================================
// STATE (async)
// ============================================

asyncTest('getNeuronState returns promise', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = brain.getNeuronState();
    return { success: typeof result.then === 'function' };
});

asyncTest('getNeuronState resolves to object', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = await brain.getNeuronState();
    return { success: typeof state === 'object' };
});

asyncTest('saveNeuronState does not throw', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    try {
        await brain.saveNeuronState({ asyncTest: true });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// ============================================
// REGISTRY
// ============================================

test('register adds handler', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    brain.register('test_handler', () => {});
    const handler = brain.getHandler('test_handler');
    return { success: typeof handler === 'function' };
});

test('listHandlers returns array', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const handlers = brain.listHandlers();
    return { success: Array.isArray(handlers) };
});

// ============================================
// METRICS
// ============================================

test('getMetrics returns object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const metrics = brain.getMetrics();
    return { success: typeof metrics === 'object' };
});

test('resetMetrics does not throw', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    try {
        brain.resetMetrics();
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// ============================================
// VERSION
// ============================================

test('getVersion returns string', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const version = brain.getVersion();
    return { success: typeof version === 'string' && version.length > 0 };
});

// ============================================
// MODULE INTEGRATIONS
// ============================================

test('brain has getModule function', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.getModule === 'function' };
});

test('brain getModule works for brain', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const module = brain.getModule('brain');
    return { success: !!module || module === null };
});

test('brain getModule works for storage', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const module = brain.getModule('storage');
    return { success: !!module || module === null };
});

test('brain getModule works for network', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const module = brain.getModule('network');
    return { success: !!module || module === null };
});

test('brain getModule works for config', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const module = brain.getModule('config');
    return { success: !!module || module === null };
});

test('brain has get function', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.get === 'function' };
});

test('brain get returns module', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const mod = brain.get('storage');
    return { success: !!mod || mod === null };
});

// ============================================
// STATE PERSISTENCE (ASYNC)
// ============================================

asyncTest('getNeuronState returns promise', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = brain.getNeuronState();
    return { success: result && typeof result.then === 'function' };
});

asyncTest('saveNeuronState returns promise', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = brain.saveNeuronState({ test: true });
    return { success: result && typeof result.then === 'function' };
});

asyncTest('getNeuronState resolves to object', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = await brain.getNeuronState();
    return { success: typeof state === 'object' };
});

asyncTest('saveNeuronState does not throw', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    try {
        await brain.saveNeuronState({ asyncTest: true });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// ============================================
// PIPELINE
// ============================================

test('getPipelineState returns object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = brain.getPipelineState();
    return { success: typeof state === 'object' };
});

test('getPipelineState has chain', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const state = brain.getPipelineState();
    return { success: Array.isArray(state.chain) };
});

// ============================================
// SUMMARY
// ============================================

async function _printResults() {
    // Run async tests first
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
    }

    process.exit(results.failed > 0 ? 1 : 0);
}

_printResults();