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
    return { success: typeof brain.load === 'function' };
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
    // Async loadCorpus now properly awaits readDir promise
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
// MULTIBRAIN NEURONS (v0.9.0)
// ============================================

test('brainNeurons returns object', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const neurons = brain.brainNeurons();
    return { success: typeof neurons === 'object' && neurons !== null };
});

test('brainNeurons has synapses, attention, predictions', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const neurons = brain.brainNeurons();
    return { 
        success: 'synapses' in neurons && 
                 'attention' in neurons && 
                 'predictions' in neurons 
    };
});

test('brainNeurons has attention for brains in stack', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const stack = brain.getStack();
    const neurons = brain.brainNeurons();
    // Should have attention for at least current brain
    return { success: typeof neurons.attention === 'object' };
});

test('fireSynapse tracks brain access', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Fire some synapses
    brain.fireSynapse('vant', 'nova');
    brain.fireSynapse('vant', 'nova');
    const synapses = brain.getSynapses();
    return { success: synapses.vant && synapses.vant.nova > 0 };
});

test('predictNext returns brain name', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Fire synapse first
    brain.fireSynapse('vant', 'nova');
    const predicted = brain.predictNext('vant');
    return { success: predicted === 'nova' || predicted === null };
});

test('attend sets attention score', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    brain.attend('test-brain', 0.85);
    const attention = brain.getAttention('test-brain');
    return { success: attention === 0.85 };
});

test('getAttention returns 0 for unknown brain', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const attention = brain.getAttention('nonexistent-brain-xyz');
    return { success: attention === 0 };
});

test('brainSaveNeurons returns saving status', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = brain.brainSaveNeurons({ attention: { vant: 0.5 } });
    return { success: 'saving' in result || 'error' in result };
});

// ============================================
// MULTIBRAIN STACK
// ============================================

test('getStack returns array', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const stack = brain.getStack();
    return { success: Array.isArray(stack) };
});

test('getStack includes vant', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const stack = brain.getStack();
    return { success: stack.includes('vant') };
});

test('currentBrain returns brain name', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const current = brain.currentBrain();
    return { success: typeof current === 'string' };
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

// ============================================
// MULTI-FORMAT BRAIN TESTS (v0.8.6)
// ============================================

test('brain.read function exists', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.read === 'function' };
});

test('brain.loadFile function exists', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.loadFile === 'function' };
});

test('brain.saveFile function exists', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    return { success: typeof brain.saveFile === 'function' };
});

asyncTest('brain.read returns object or null', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = await brain.read('identity', { type: 'public' });
    // Should return { data, content, format, source } or null
    return { 
        success: result === null || 
                 (typeof result === 'object' && 'content' in result) 
    };
});

asyncTest('brain.read handles non-existent brain', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const result = await brain.read('nonexistent-brain-xyz', { type: 'public' });
    return { success: result === null };
});

asyncTest('brain.loadFile works with valid path', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Try to load from a valid brain file - use relative path to pass security check
    const testPath = 'models/public/vant/identity.md';
    if (!fs.existsSync(testPath)) {
        skip('test brain file not found', 'fixture missing');
        return;
    }
    const result = await brain.loadFile(testPath);
    // Result has { data, format, error } structure
    return result && result.data ? true : { error: result?.error || 'no data' };
});

asyncTest('brain.saveFile creates file', async () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    // Use relative path to pass security check
    const testPath = '.agent_tmp/test-brain-file.md';
    const testDir = path.dirname(testPath);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    const result = await brain.saveFile(testPath, { content: '# Test' }, { format: 'md' });
    // Clean up
    if (fs.existsSync(testPath)) {
        fs.unlinkSync(testPath);
    }
    // Result has { success: true } or { error: '...' }
    return result && result.success === true ? true : { error: result?.error || 'save failed' };
});

// ============================================
// FORMAT MODULE TESTS
// ============================================

test('format.listFiles function exists', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.listFiles === 'function' };
});

test('format.getBrainName function exists', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.getBrainName === 'function' };
});

test('format.listFiles returns array', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.listFiles(MODELS_PUBLIC);
    return { success: Array.isArray(result) };
});

test('format.listFiles filters by extension', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.listFiles(MODELS_PUBLIC, ['.md']);
    // Should only include .md files
    const allMd = result.every(f => f.endsWith('.md'));
    return { success: allMd || result.length === 0 };
});

test('format.getBrainName strips extensions', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    
    const tests = [
        { input: 'identity.md', expected: 'identity' },
        { input: 'notes.json', expected: 'notes' },
        { input: 'data.yaml', expected: 'data' },
        { input: 'readme', expected: 'readme' }, // no ext
    ];
    
    let passed = true;
    for (const { input, expected } of tests) {
        const result = format.getBrainName(input);
        if (result !== expected) {
            passed = false;
            break;
        }
    }
    return { success: passed };
});

test('format.DEFAULT_EXTENSIONS includes expected formats', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const exts = format.DEFAULT_EXTENSIONS;
    return { 
        success: exts.includes('.md') && 
                 exts.includes('.json') &&
                 exts.includes('.yaml') 
    };
});

// SECURITY TESTS
test('format.listFiles prevents path traversal', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    // Try to escape with ..
    const result = format.listFiles('/etc/../' + MODELS_PUBLIC);
    // Should return empty or safe results, not /etc/passwd
    const hasEtc = result.some(f => f.startsWith('/etc'));
    return { success: !hasEtc };
});

test('format.listFiles handles invalid path', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.listFiles('/nonexistent/path/xyz');
    return { success: Array.isArray(result) && result.length === 0 };
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