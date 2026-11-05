#!/usr/bin/env node
/**
 * Prune Module Unit Tests
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

console.log('\n✂️  PRUNE MODULE TESTS\n');

test('prune module loads', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: !!prune };
});

test('prune has prune function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.prune === 'function' };
});

test('prune has getCore function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.getCore === 'function' };
});

test('prune has getStats function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.getStats === 'function' };
});

test('prune has listPrunable function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.listPrunable === 'function' };
});

test('prune has isFluff function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.isFluff === 'function' };
});

test('prune has hasDecisions function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.hasDecisions === 'function' };
});

test('prune has extractFacts function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.extractFacts === 'function' };
});

test('prune has getAgeDays function', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.getAgeDays === 'function' };
});

test('prune has DEFAULT_STALE_DAYS', () => {
    const prune = require(path.join(ROOT, 'lib', 'prune'));
    return { success: typeof prune.DEFAULT_STALE_DAYS === 'number' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);