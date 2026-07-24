#!/usr/bin/env node
/**
 * API Module Unit Tests
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

console.log('\n🌐 API MODULE TESTS\n');

test('api module loads', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: !!api };
});

test('api has API class', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: !!api.API };
});

test('api has create function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.create === 'function' };
});

test('api has execute function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.execute === 'function' };
});

test('api has read function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.read === 'function' };
});

test('api has write function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.write === 'function' };
});

test('api has call function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.call === 'function' };
});

test('api has brain function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.brain === 'function' };
});

test('api has brainCorpus function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.brainCorpus === 'function' };
});

test('api has brainState function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.brainState === 'function' };
});

test('api has brainList function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.brainList === 'function' };
});

test('api has onBeforeExecute function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.onBeforeExecute === 'function' };
});

test('api has onAfterExecute function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.onAfterExecute === 'function' };
});

test('api has onError function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.onError === 'function' };
});

test('api has sandbox function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: !!api.sandbox };
});

test('api has getMode function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.getMode === 'function' };
});

test('api has setMode function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.setMode === 'function' };
});

test('api has getStatus function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.getStatus === 'function' };
});

test('api has isOperationAllowed function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.isOperationAllowed === 'function' };
});

// Stack tests
test('api has getStackAPIStatus function', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    return { success: typeof api.getStackAPIStatus === 'function' };
});

test('getStackAPIStatus returns object with source stack', () => {
    const api = require(path.join(ROOT, 'lib', 'api'));
    const result = api.getStackAPIStatus();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);