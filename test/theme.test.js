#!/usr/bin/env node
/**
 * Theme Module Unit Tests
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

console.log('\n💨 THEME MODULE TESTS\n');

test('theme module loads', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: !!t };
});

test('theme has create function', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: typeof t.create === 'function' };
});

test('theme has applyToMCP function', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: typeof t.applyToMCP === 'function' };
});

test('theme has getBrainThemeConfig function', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: typeof t.getBrainThemeConfig === 'function' };
});

test('theme has setBrainThemeConfig function', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: typeof t.setBrainThemeConfig === 'function' };
});

test('theme has getStackThemeConfigs function', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    return { success: typeof t.getStackThemeConfigs === 'function' };
});

test('getStackThemeConfigs returns object with source stack', () => {
    const t = require(path.join(ROOT, 'lib', 'theme'));
    const result = t.getStackThemeConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
