#!/usr/bin/env node
/**
 * Schema Module Unit Tests
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

console.log('\n📋 SCHEMA MODULE TESTS\n');

test('schema module loads', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: !!schema };
});

test('schema has validateFile function', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.validateFile === 'function' };
});

test('schema has validateState function', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.validateState === 'function' };
});

test('schema has isValid function', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.isValid === 'function' };
});

test('schema has getSchema function', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.getSchema === 'function' };
});

test('schema has CLI', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.CLI === 'function' };
});

test('schema has BRAIN_SCHEMA', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.BRAIN_SCHEMA === 'object' };
});

test('schema has LTC_SCHEMA', () => {
    const schema = require(path.join(ROOT, 'lib', 'schema'));
    return { success: typeof schema.LTC_SCHEMA === 'object' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);