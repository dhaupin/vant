#!/usr/bin/env node
/**
 * Shell Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

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

console.log('\n💨 SHELL MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('shell module loads', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: !!shell };
});

// ============================================
// EXPORTS
// ============================================

test('shell has exec function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.exec === 'function' };
});

test('shell has getLayerStatus function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.getLayerStatus === 'function' };
});

test('shell has isOperationAllowed function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('shell has getBrainShellConfig function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.getBrainShellConfig === 'function' };
});

test('shell has setBrainShellConfig function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.setBrainShellConfig === 'function' };
});

// Stack tests
test('shell has getStackShellConfigs function', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    return { success: typeof shell.getStackShellConfigs === 'function' };
});

test('getStackShellConfigs returns object with source stack', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    const result = shell.getStackShellConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);
