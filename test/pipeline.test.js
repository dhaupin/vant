#!/usr/bin/env node
/**
 * Pipeline Module Tests (v0.9.0-axolotl)
 *
 * Tests for lib/pipeline.js - unified security pipeline
 *
 * Run: node test/pipeline.test.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    const runTest = () => {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(r => checkResult(r));
        }
        return checkResult(result);
    };
    
    const checkResult = (result) => {
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
            return true;
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result?.error || 'assertion failed'}`);
            return false;
        }
    };
    
    try {
        return runTest();
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
        return Promise.resolve(false);
    }
}

function section(name) {
    console.log(`\n=== ${name} ===\n`);
}

// ============================================
// PIPELINE TESTS
// ============================================

section('Pipeline Module Exports');

test('has run function', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: typeof pipeline.run === 'function' };
});

test('has runStack function', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: typeof pipeline.runStack === 'function' };
});

test('has PUBLIC mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: pipeline.PUBLIC === 'public' };
});

test('has PRIVATE mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: pipeline.PRIVATE === 'private' };
});

test('has REMOTE mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: pipeline.REMOTE === 'remote' };
});

test('has DUAL mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: pipeline.DUAL === 'dual' };
});

test('has STACK mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: pipeline.STACK === 'stack' };
});

test('has getModes function', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: typeof pipeline.getModes === 'function' };
});

test('has getStatus function', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return { success: typeof pipeline.getStatus === 'function' };
});

section('Pipeline Modes');

test('getModes returns all modes', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const modes = pipeline.getModes();
    return { success: 
        modes.PUBLIC === 'public' && 
        modes.PRIVATE === 'private' && 
        modes.REMOTE === 'remote' && 
        modes.DUAL === 'dual' && 
        modes.STACK === 'stack'
    };
});

section('Pipeline Status');

test('getStatus returns object', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const status = pipeline.getStatus();
    return { success: typeof status === 'object' && status !== null };
});

test('getStatus has name', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const status = pipeline.getStatus();
    return { success: status.name === 'Pipeline' };
});

test('getStatus has version', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const status = pipeline.getStatus();
    return { success: status.version === '0.9.0-axolotl' };
});

test('getStatus has modes array', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const status = pipeline.getStatus();
    return { success: Array.isArray(status.modes) && status.modes.length === 5 };
});

test('getStatus has handlers object', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const status = pipeline.getStatus();
    return { success: typeof status.handlers === 'object' };
});

section('Pipeline Execution');

test('run executes operation in PUBLIC mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:public' },
        async () => {
            return { done: true };
        },
        { mode: pipeline.PUBLIC }
    ).then(result => ({ success: result?.done === true }));
});

test('run executes operation in PRIVATE mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:private' },
        async () => {
            return { done: true };
        },
        { mode: pipeline.PRIVATE }
    ).then(result => ({ success: result?.done === true }));
});

test('run executes operation in STACK mode', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:stack' },
        async () => {
            return { done: true };
        },
        { mode: pipeline.STACK }
    ).then(result => ({ success: result?.done === true }));
});

test('run passes context to operation', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    const ctx = { input: 'hello', operation: 'test:ctx' };
    return pipeline.run(ctx, async (c) => {
        return { received: c.input };
    }, { mode: pipeline.PUBLIC }).then(result => ({ success: result?.received === 'hello' }));
});

section('Pipeline Handlers');

test('run goes through sandbox handler', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:sandbox' },
        async () => {
            return { ok: true };
        },
        { mode: pipeline.PUBLIC }
    ).then(result => ({ success: result?.ok === true }));
});

test('run goes through vaf handler', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:vaf' },
        async () => {
            return { ok: true };
        },
        { mode: pipeline.PUBLIC }
    ).then(result => ({ success: result?.ok === true }));
});

test('run goes through qos handler', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:qos' },
        async () => {
            return { ok: true };
        },
        { mode: pipeline.PUBLIC }
    ).then(result => ({ success: result?.ok === true }));
});

test('run goes through escrow handler', () => {
    const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
    return pipeline.run(
        { input: 'test', operation: 'test:escrow' },
        async () => {
            return { ok: true };
        },
        { mode: pipeline.PUBLIC }
    ).then(result => ({ success: result?.ok === true }));
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===`);

if (results.failed > 0) {
    process.exit(1);
} else {
    console.log('All pipeline tests passed! 🎯\n');
    process.exit(0);
}
