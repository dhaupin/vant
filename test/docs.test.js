#!/usr/bin/env node
/**
 * Docs Module Unit Tests
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

console.log('\n💨 DOCS MODULE TESTS\n');

test('docs module loads', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    return { success: !!d };
});

test('docs has generateOpenAPI function', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    return { success: typeof d.generateOpenAPI === 'function' };
});

test('docs has getBrainDocsConfig function', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    return { success: typeof d.getBrainDocsConfig === 'function' };
});

test('docs has setBrainDocsConfig function', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    return { success: typeof d.setBrainDocsConfig === 'function' };
});

test('docs has getStackDocsConfigs function', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    return { success: typeof d.getStackDocsConfigs === 'function' };
});

test('getStackDocsConfigs returns object with source stack', () => {
    const d = require(path.join(ROOT, 'lib', 'docs'));
    const result = d.getStackDocsConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
