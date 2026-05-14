#!/usr/bin/env node
/**
 * Vant Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

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

console.log('\n🧠 VANT MODULE TESTS\n');

test('vant module loads', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant };
});

test('vant has init function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.init === 'function' };
});

test('vant has think function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.think === 'function' };
});

test('vant has learn function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.learn === 'function' };
});

test('vant has remember function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.remember === 'function' };
});

test('vant has act function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.act === 'function' };
});

test('vant has getState function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getState === 'function' };
});

test('vant has getStatus function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getStatus === 'function' };
});

test('vant has Runtime class', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant.Runtime };
});

test('vant has storage module', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: !!vant.storage };
});

test('vant has getTools function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.getTools === 'function' };
});

test('vant has executeTool function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.executeTool === 'function' };
});

test('vant has isOperationAllowed function', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    return { success: typeof vant.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);