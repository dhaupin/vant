#!/usr/bin/env node
/**
 * Error Module Unit Tests
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

console.log('\n⚠️  ERROR MODULE TESTS\n');

test('error module loads', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err };
});

test('error has Error class', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err.Error };
});

test('error has CODES object', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.CODES === 'object' };
});

test('error has handle function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.handle === 'function' };
});

test('error has retry function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.retry === 'function' };
});

test('error has wrap function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.wrap === 'function' };
});

test('error has sleep function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.sleep === 'function' };
});

test('error has ErrorHandler class', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err.ErrorHandler };
});

test('error has createErrorHandler function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.createErrorHandler === 'function' };
});

test('error has onError function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.onError === 'function' };
});

// Stack tests
test('error has getStackErrorStats function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.getStackErrorStats === 'function' };
});

test('getStackErrorStats returns object with source stack', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const stats = err.getStackErrorStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);