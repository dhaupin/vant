#!/usr/bin/env node
/**
 * Framework Module Unit Tests
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

console.log('\n🖼️  FRAMEWORK MODULE TESTS\n');

test('framework module loads', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: !!framework };
});

test('framework has init function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.init === 'function' };
});

test('framework has think function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.think === 'function' };
});

test('framework has act function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.act === 'function' };
});

test('framework has execute function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.execute === 'function' };
});

test('framework has query function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.query === 'function' };
});

test('framework has getState function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.getState === 'function' };
});

test('framework has appStatus function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.appStatus === 'function' };
});

test('framework has runtime', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: !!framework.runtime };
});

test('framework has brain module', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: !!framework.brain };
});

test('framework has search module', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: !!framework.search };
});

test('framework has Framework class', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: !!framework.Framework };
});

test('framework has getStatus function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.getStatus === 'function' };
});

test('framework has isOperationAllowed function', () => {
    const framework = require(path.join(ROOT, 'lib', 'framework'));
    return { success: typeof framework.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);