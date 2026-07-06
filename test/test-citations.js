#!/usr/bin/env node
/**
 * Citations Module Unit Tests
 *
 * Run: node test/test-citations.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const citations = require('../lib/citations');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

console.log('\n=== Citations Module Tests ===\n');

// Test 1: Core exports
test('has addSource function', () => {
    return typeof citations.addSource === 'function';
});

test('has formatCitation function', () => {
    return typeof citations.formatCitation === 'function';
});

test('has formatCitations function', () => {
    return typeof citations.formatCitations === 'function';
});

test('has getAll function', () => {
    return typeof citations.getAll === 'function';
});

test('has getCommitFooter function', () => {
    return typeof citations.getCommitFooter === 'function';
});

test('has clear function', () => {
    return typeof citations.clear === 'function';
});

test('has verify function', () => {
    return typeof citations.verify === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All citations tests passed! ✅\n');
