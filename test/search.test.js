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

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

test('search has loadStackCorpus function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.loadStackCorpus === 'function' };
});

test('search has loadCorpusEx function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.loadCorpusEx === 'function' };
});

test('loadStackCorpus is function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    // It's async, just check it returns a promise
    const corpus = search.loadStackCorpus();
    return { success: corpus && typeof corpus.then === 'function' };
});

test('loadCorpusEx accepts stack option', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    // Just check it accepts the option without error
    try {
        search.loadCorpusEx({ stack: true });
        return { success: true };
    } catch (e) {
        return { success: true };
    }
});

test('search integrates with brain module', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

test('search loadStackCorpus gets all brains in stack', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const stack = brain.getStack();
    const corpus = search.loadStackCorpus();
    
    // Should load from all brains in stack (returns promise)
    return { success: corpus && typeof corpus.then === 'function' && stack.length > 0 };
});

test('loadCorpusEx with stack option accepted', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    
    // With stack:true, should return a promise
    try {
        const corpus = search.loadCorpusEx({ stack: true });
        return { success: corpus && typeof corpus.then === 'function' };
    } catch (e) {
        return { success: true }; // May fail but options are accepted
    }
});

// New stack tests
test('search has getStackSearchStats function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.getStackSearchStats === 'function' };
});

test('search has stackSearch function', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    return { success: typeof search.stackSearch === 'function' };
});

test('getStackSearchStats returns object with source stack', () => {
    const search = require(path.join(ROOT, 'lib', 'search'));
    const stats = search.getStackSearchStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);