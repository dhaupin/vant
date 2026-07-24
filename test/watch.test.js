#!/usr/bin/env node
/**
 * Watch Module Unit Tests
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

console.log('\n💨 WATCH MODULE TESTS\n');

test('watch module loads', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: !!w };
});

test('watch has Watch class', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: typeof w.Watch === 'function' };
});

test('watch has Spring class', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: typeof w.Spring === 'function' };
});

test('watch has getBrainWatchConfig function', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: typeof w.getBrainWatchConfig === 'function' };
});

test('watch has setBrainWatchConfig function', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: typeof w.setBrainWatchConfig === 'function' };
});

test('watch has getStackWatchConfigs function', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    return { success: typeof w.getStackWatchConfigs === 'function' };
});

test('getStackWatchConfigs returns object with source stack', () => {
    const w = require(path.join(ROOT, 'lib', 'watch'));
    const result = w.getStackWatchConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
