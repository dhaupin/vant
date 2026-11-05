#!/usr/bin/env node
/**
 * Recursion Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n💨 RECURSION MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('recursion module loads', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: !!r };
});

test('recursion has check function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.check === 'function' };
});

test('recursion has release function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.release === 'function' };
});

test('recursion has getDepth function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.getDepth === 'function' };
});

test('recursion has reset function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.reset === 'function' };
});

test('recursion has guard function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.guard === 'function' };
});

test('recursion has getBrainRecursionConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.getBrainRecursionConfig === 'function' };
});

test('recursion has setBrainRecursionConfig function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.setBrainRecursionConfig === 'function' };
});

test('recursion has getStackRecursionConfigs function', () => {
    const r = require(path.join(ROOT, 'lib', 'recursion'));
    return { success: typeof r.getStackRecursionConfigs === 'function' };
});

// ============================================
// BEHAVIOR - check() / release()
// ============================================

const recursion = require(path.join(ROOT, 'lib', 'recursion'));

test('check returns allowed: true for first call', () => {
    recursion.reset(); // Clean slate
    const result = recursion.check('test_op');
    return { success: result.allowed === true };
});

test('check returns depth: 1 for first call', () => {
    recursion.reset();
    const result = recursion.check('test_op');
    return { success: result.depth === 1 };
});

test('check increments depth on repeated calls', () => {
    recursion.reset();
    recursion.check('test_op');
    const result = recursion.check('test_op');
    return { success: result.depth === 2 };
});

test('release decrements depth', () => {
    recursion.reset();
    recursion.check('test_op');
    recursion.check('test_op');
    recursion.release('test_op');
    const depth = recursion.getDepth('test_op');
    return { success: depth === 1 };
});

test('release allows depth to go to 0', () => {
    recursion.reset();
    recursion.check('test_op');
    recursion.release('test_op');
    const depth = recursion.getDepth('test_op');
    return { success: depth === 0 };
});

test('getDepth returns 0 for unknown operation', () => {
    recursion.reset();
    const depth = recursion.getDepth('nonexistent_op');
    return { success: depth === 0 };
});

test('check with maxDepth returns allowed: false when exceeded', () => {
    recursion.reset();
    recursion.check('test_op');
    recursion.check('test_op');
    const result = recursion.check('test_op', 2); // max 2
    return { success: result.allowed === false };
});

test('check with maxDepth returns correct reason', () => {
    recursion.reset();
    recursion.check('test_op');
    recursion.check('test_op');
    const result = recursion.check('test_op', 2);
    return { success: result.reason === 'max_depth_exceeded' };
});

test('reset clears all depths', () => {
    recursion.check('test_op');
    recursion.check('test_op');
    recursion.reset();
    const depth = recursion.getDepth('test_op');
    return { success: depth === 0 };
});

test('guard wrapper executes function and releases', () => {
    recursion.reset();
    let executed = false;
    const result = recursion.guard('test_op', () => {
        executed = true;
        return 'result';
    });
    const depth = recursion.getDepth('test_op');
    return { success: executed === true && result === 'result' && depth === 0 };
});

test('getStackRecursionConfigs returns object with source stack', () => {
    const result = recursion.getStackRecursionConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================
// RESULTS
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
