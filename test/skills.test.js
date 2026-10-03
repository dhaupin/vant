#!/usr/bin/env node
/**
 * Skills Module Unit Tests
 * Tests for skills functionality with multibrain support
 * 
 * Run: node test/skills.test.js
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

console.log('\n🔧 SKILLS MODULE TESTS\n');

// Test 1: Module loads
test('skills module loads', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: !!skills };
});

// Test 2: Has get function
test('skills has get function', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: typeof skills.get === 'function' };
});

// Test 3: Has getManifest function
test('skills has getManifest function', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: typeof skills.getManifest === 'function' };
});

// Test 4: Has findTriggers function
test('skills has findTriggers function', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: typeof skills.findTriggers === 'function' };
});

// Test 5: Has clearCache function
test('skills has clearCache function', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: typeof skills.clearCache === 'function' };
});

// Test 6: Has DEFAULT_SKILLS constant
test('skills has DEFAULT_SKILLS constant', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    return { success: typeof skills.DEFAULT_SKILLS === 'object' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 7: skills integrates with brain module
test('skills integrates with brain module', () => {
    const skills = require(path.join(ROOT, 'lib', 'skills'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test 8: skills uses brain path
test('skills uses brain path', () => {
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
