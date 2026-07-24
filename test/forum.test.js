#!/usr/bin/env node
/**
 * Forum Module Unit Tests
 * Tests for forum (discussion) functionality with multibrain support
 * 
 * Run: node test/forum.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

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

console.log('\n💬 FORUM MODULE TESTS\n');

// Test 1: Module loads
test('forum module loads', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: !!forum };
});

// Test 2: Has Forum class
test('forum has Forum class', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: !!forum.Forum };
});

// Test 3: Has list function
test('forum has list function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.list === 'function' };
});

// Test 4: Has get function
test('forum has get function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.get === 'function' };
});

// Test 5: Has save function
test('forum has save function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.save === 'function' };
});

// Test 6: Has load function
test('forum has load function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.load === 'function' };
});

// Test 7: Has publish function
test('forum has publish function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.publish === 'function' };
});

// Test 8: Has message function
test('forum has message function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.message === 'function' };
});

// Test 9: Has vote function
test('forum has vote function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.vote === 'function' };
});

// Test 10: Has status function
test('forum has status function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.status === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 11: forum integrates with brain module
test('forum integrates with brain module', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test 12: forum has loadFromBrain function
test('forum has loadFromBrain function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.loadFromBrain === 'function' };
});

// Test 13: forum has saveToBrain function
test('forum has saveToBrain function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.saveToBrain === 'function' };
});

// ============================================
// STACK SUPPORT TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

// Test 14: forum uses getBrainPath
test('forum uses getBrainPath', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const brainPath = brain.getBrainPath();
    return { success: !!brainPath };
});

// Test 15: forum can use brain context
test('forum can use brain context', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    // Forum should work with current brain context
    return { success: !!currentBrain };
});

// Test 16: forum has getStackForumStatus
test('forum has getStackForumStatus function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.getStackForumStatus === 'function' };
});

// Test 17: forum has listStackIntersections function
test('forum has listStackIntersections function', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    return { success: typeof forum.listStackIntersections === 'function' };
});

// Test 18: getStackForumStatus returns object with source stack
test('getStackForumStatus returns object with source stack', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    const status = forum.getStackForumStatus();
    return { success: status && status.source === 'stack' };
});

// Test 19: listStackIntersections returns array
test('listStackIntersections returns array', () => {
    const forum = require(path.join(ROOT, 'lib', 'forum'));
    const intersections = forum.listStackIntersections();
    return { success: Array.isArray(intersections) };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Skipped: ${results.skipped}`);
console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
}
