#!/usr/bin/env node
/**
 * do.js Unit Tests
 * Tests for the universal sync/async helper, especially v0.9.0-axolotl T8: guard()
 *
 * Pattern: use require.cache mocking (same as forum.unpublish tests) to inject
 * a stub sandbox. There is intentionally no public _resetGuard setter — exposing
 * a way to swap the sandbox would be an attack surface in an OSS project.
 */

const path = require('path');
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

// Inject a stub sandbox into require.cache, load a fresh do.js, and return
// a { doMod, restore } pair. The caller MUST invoke restore() after use so
// subsequent tests in the same process see the real sandbox.
function loadDoWithSandbox(sandboxExport) {
    const doPath = path.join(ROOT, 'lib', 'do.js');
    const sandboxPath = path.join(ROOT, 'lib', 'sandbox.js');
    const origDo = require.cache[doPath];
    const origSandbox = require.cache[sandboxPath];
    delete require.cache[doPath];
    require.cache[sandboxPath] = {
        id: sandboxPath,
        filename: sandboxPath,
        loaded: true,
        exports: sandboxExport
    };
    const doMod = require(doPath);
    return {
        doMod,
        restore: () => {
            delete require.cache[doPath];
            if (origSandbox) require.cache[sandboxPath] = origSandbox;
            else delete require.cache[sandboxPath];
            if (origDo) require.cache[doPath] = origDo;
        }
    };
}

console.log('\n🎯 DO.JS TESTS\n');

// ==================== v0.9.0-axolotl T8 ====================

test('do.js exports guard function (T8)', () => {
    const doMod = require(path.join(ROOT, 'lib', 'do'));
    return {
        success: typeof doMod.guard === 'function',
        error: 'no guard export'
    };
});

test('do.guard("read") with no sandbox does not throw (T8)', () => {
    // The real sandbox is in require.cache. It uses the default canRead/canWrite
    // (whatever it ships with), so the first call captures the defaults and
    // subsequent calls treat it as a default sandbox (allow with warn, silent
    // in tests).
    const doMod = require(path.join(ROOT, 'lib', 'do'));
    try {
        doMod.guard('read', { silent: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: `unexpected throw: ${e.message}` };
    }
});

test('do.guard("write") with no sandbox does not throw (T8)', () => {
    const doMod = require(path.join(ROOT, 'lib', 'do'));
    try {
        doMod.guard('write', { silent: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: `unexpected throw: ${e.message}` };
    }
});

// The guard compares `current canFn === captured default canFn`. To simulate
// a real, configured sandbox that denies, we capture the default with one
// function reference and then swap in a different function reference whose
// value is `false`. The guard sees a non-default sandbox and enforces the
// deny predicate.
test('do.guard throws when sandbox.canRead is false (T8)', () => {
    let canReadValue = true;
    let canWriteValue = true;
    let readFn = () => canReadValue;
    let writeFn = () => canWriteValue;
    const stub = {
        get canRead() { return readFn; },
        get canWrite() { return writeFn; }
    };
    const { doMod, restore } = loadDoWithSandbox(stub);
    try {
        // Capture defaults
        doMod.guard('read', { silent: true });
        doMod.guard('write', { silent: true });
        // Swap to new function reference and set deny value
        canReadValue = false;
        readFn = () => canReadValue;
        try {
            doMod.guard('read', { silent: true });
            return { success: false, error: 'expected throw' };
        } catch (e) {
            const ok = /Read permission required/.test(e.message);
            return { success: ok, error: ok ? null : `wrong error: ${e.message}` };
        }
    } finally {
        restore();
    }
});

test('do.guard throws when sandbox.canWrite is false (T8)', () => {
    let canReadValue = true;
    let canWriteValue = true;
    let readFn = () => canReadValue;
    let writeFn = () => canWriteValue;
    const stub = {
        get canRead() { return readFn; },
        get canWrite() { return writeFn; }
    };
    const { doMod, restore } = loadDoWithSandbox(stub);
    try {
        doMod.guard('read', { silent: true });
        doMod.guard('write', { silent: true });
        canWriteValue = false;
        writeFn = () => canWriteValue;
        try {
            doMod.guard('write', { silent: true });
            return { success: false, error: 'expected throw' };
        } catch (e) {
            const ok = /Write permission required/.test(e.message);
            return { success: ok, error: ok ? null : `wrong error: ${e.message}` };
        }
    } finally {
        restore();
    }
});

test('do.js does NOT export _resetGuard (T8b — OSS safety)', () => {
    // v0.9.0-axolotl T8b: removed _resetGuard from public exports because it
    // would let any caller swap the sandbox module reference, bypassing the
    // entire guard. Tests use require.cache mocking instead.
    const doMod = require(path.join(ROOT, 'lib', 'do'));
    return {
        success: doMod._resetGuard === undefined,
        error: doMod._resetGuard !== undefined ? '_resetGuard is still exported' : null
    };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
