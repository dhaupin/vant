#!/usr/bin/env node
/**
 * Citations Module Unit Tests
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

console.log('\n📖 CITATIONS MODULE TESTS\n');

test('citations module loads', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: !!citations };
});

test('citations has addSource function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.addSource === 'function' };
});

test('citations has formatCitation function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.formatCitation === 'function' };
});

test('citations has formatCitations function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.formatCitations === 'function' };
});

test('citations has getAll function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.getAll === 'function' };
});

test('citations has getCommitFooter function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.getCommitFooter === 'function' };
});

test('citations has clear function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.clear === 'function' };
});

test('citations has generateReceipts function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.generateReceipts === 'function' };
});

test('citations has verify function', () => {
    const citations = require(path.join(ROOT, 'lib', 'citations'));
    return { success: typeof citations.verify === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);