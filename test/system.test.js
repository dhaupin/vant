#!/usr/bin/env node
/**
 * System Module Unit Tests
 * Tests for system functionality with multibrain support
 * 
 * Run: node test/system.test.js
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

console.log('\n🖥️ SYSTEM MODULE TESTS\n');

// Test 1: Module loads
test('system module loads', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: !!system };
});

// Test 2: Has status function
test('system has status function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.status === 'function' };
});

// Test 3: Has healthy function
test('system has healthy function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.healthy === 'function' };
});

// Test 4: Has getStatus function
test('system has getStatus function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.getStatus === 'function' };
});

// Test 5: Has getLayerStatus function
test('system has getLayerStatus function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.getLayerStatus === 'function' };
});

// Test 6: Has isOperationAllowed function
test('system has isOperationAllowed function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 7: system integrates with brain module
test('system integrates with brain module', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test 8: system uses brain path
test('system uses brain path', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const brainPath = brain.getBrainPath();
    return { success: !!brainPath };
});

// Test 9: system has getStackSystemStatus
test('system has getStackSystemStatus function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.getStackSystemStatus === 'function' };
});

// Test 10: system has getStackHealth function
test('system has getStackHealth function', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    return { success: typeof system.getStackHealth === 'function' };
});

// Test 11: getStackSystemStatus returns object with source stack
test('getStackSystemStatus returns object with source stack', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    const status = system.getStackSystemStatus();
    return { success: status && status.source === 'stack' };
});

// Test 12: getStackHealth returns object with source stack
test('getStackHealth returns object with source stack', () => {
    const system = require(path.join(ROOT, 'lib', 'system'));
    const health = system.getStackHealth();
    return { success: health && health.source === 'stack' };
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
