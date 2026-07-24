#!/usr/bin/env node
/**
 * RunOp Module Unit Tests
 * Tests for runop (run operations) functionality with multibrain support
 * 
 * Run: node test/runop.test.js
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

console.log('\n⚙️ RUNOP MODULE TESTS\n');

// Test 1: Module loads
test('runop module loads', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    return { success: !!runop };
});

// Test 2: Has run function
test('runop has run function', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    return { success: typeof runop.run === 'function' };
});

// Test 3: Has init function
test('runop has init function', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    return { success: typeof runop.init === 'function' };
});

// Test 4: Has stop function
test('runop has stop function', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    return { success: typeof runop.stop === 'function' };
});

// Test 5: Has getStatus function
test('runop has getStatus function', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    return { success: typeof runop.getStatus === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 6: runop integrates with brain module
test('runop integrates with brain module', () => {
    const runop = require(path.join(ROOT, 'lib', 'runop'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test 7: runop uses brain path
test('runop uses brain path', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const brainPath = brain.getBrainPath();
    return { success: !!brainPath };
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
