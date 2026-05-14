#!/usr/bin/env node
/**
 * Search Module Unit Tests
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

console.log('\n🔍 SEARCH MODULE TESTS\n');

test('search module loads', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: !!search };
});

test('search has Search class', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: !!search.Search };
});

test('search has search function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.search === 'function' };
});

test('search has query function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.query === 'function' };
});

test('search has indexDocument function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.indexDocument === 'function' };
});

test('search has queryBrain function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.queryBrain === 'function' };
});

test('search has rerank function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.rerank === 'function' };
});

test('search has hybrid function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.hybrid === 'function' };
});

test('search has getIndex function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.getIndex === 'function' };
});

test('search has getStats function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.getStats === 'function' };
});

test('search has getStatus function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.getStatus === 'function' };
});

test('search has isOperationAllowed function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);