#!/usr/bin/env node
/**
 * Brain Module Unit Tests — TRIMMED (2026-10-27 retirement audit).
 *
 * The families now measured by the vant-brain pack rows RETIRE WHOLE to
 * the pack (22 rows: 9 security + 7 brain-unit + 3 guests + 3 guests'
 * unit; `scripts/crashtest-run.js --pack vant-brain`):
 *   - module surface + paths (loadBrain/loadCorpus/getPipeline exist,
 *     getBrainPath/getPublicPath, the corpus list)
 *   - mode switch + the live pipeline chain (setMode, setPipeline,
 *     add/remove middleware)
 *   - alias law (alias/resolution/passthrough/listAliases)
 *   - the neuron layer (brainNeurons shape, fireSynapse, predictNext,
 *     attend, unknown-brain 0)
 *   - stack laws (getStack includes the ACTIVE brain, pushBrain top,
 *     switchBrain top+pointer, brainMode closed enum; the axolotl
 *     fixture seeds retire with them)
 *   - multi-format read/save + the format module (read/null-absence/
 *     loadFile/saveFile; listFiles filtering + confinement)
 *
 * What stays native here per the reverse-verification law (the pack
 * rows do not measure it):
 *   - the neuron STATE seam (getNeuronState/saveNeuronState, sync +
 *     async shapes)
 *   - the handler registry (register/getHandler/listHandlers)
 *   - metrics (getMetrics/resetMetrics) + version
 *   - module-integrations (getModule for brain/storage/network/config,
 *     brain.get through the public surface)
 *   - getPipelineState's shape (object + chain)
 *   - brain listing/hasBrain, brainDirs, loadStackCorpus,
 *     brainSaveNeurons
 *
 * Run: node test/brain.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODELS_PRIVATE = path.join(ROOT, 'models', 'private');

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

console.log('\n🧠 BRAIN MODULE TESTS (retired to packs; the unmeasured seams stay native)\n');

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
    const mod = brain.get('storage', 'config', { userCtx: { userId: 'test', roles: ['admin'] } });
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
// PIPELINE STATE
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
// BRAIN LISTING / HAS-BRAIN / DIRS (unmeasured by the pack rows)
// ============================================

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

test('brainDirs returns object with public/private', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const dirs = brain.brainDirs();
    return {
        success: typeof dirs === 'object' &&
                 'public' in dirs &&
                 'private' in dirs
    };
});

test('loadStackCorpus returns array', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const corpus = brain.loadStackCorpus({sync:true});
    return { success: Array.isArray(corpus) };
});

test('brainList returns array', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const list = brain.listBrains();
    return { success: Array.isArray(list) };
});

test('brainSaveNeurons returns saving status', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = brain.brainSaveNeurons({ attention: { vant: 0.5 } });
    return { success: 'saving' in result || 'error' in result };
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
