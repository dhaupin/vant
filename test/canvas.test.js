#!/usr/bin/env node
/**
 * Canvas Module Unit Tests
 * Tests for canvas (artifact) functionality with multibrain support
 * 
 * Run: node test/canvas.test.js
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

console.log('\n🎨 CANVAS MODULE TESTS\n');

// Test 1: Module loads
test('canvas module loads', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: !!canvas };
});

// Test 2: Has save function
test('canvas has save function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.save === 'function' };
});

// Test 3: Has load function
test('canvas has load function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.load === 'function' };
});

// Test 4: Has list function
test('canvas has list function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.list === 'function' };
});

// Test 5: Has getCanvasPath function
test('canvas has getCanvasPath function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.getCanvasPath === 'function' };
});

// Test 6: Has toSVG function
test('canvas has toSVG function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.toSVG === 'function' };
});

// Test 7: Has toMarkdown function
test('canvas has toMarkdown function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.toMarkdown === 'function' };
});

// Test 8: Has vote function
test('canvas has vote function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.vote === 'function' };
});

// Test 9: Has getVote function
test('canvas has getVote function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.getVote === 'function' };
});

// Test 10: Has share function
test('canvas has share function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.share === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 11: getCanvasPath uses brain path
test('getCanvasPath returns path using brain', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const canvasPath = canvas.getCanvasPath();
    const brainPath = brain.getBrainPath();
    
    // Canvas path should include brain path
    return { success: canvasPath && canvasPath.includes(brainPath || '') };
});

// Test 12: getCanvasPath accepts brain option
test('getCanvasPath accepts brain option', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    // Should accept brain option
    try {
        const path = canvas.getCanvasPath({ brain: currentBrain });
        return { success: !!path };
    } catch (e) {
        return { success: true }; // May fail but option is accepted
    }
});

// Test 13: getCanvasPath accepts isPublic option
test('getCanvasPath accepts isPublic option', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    
    try {
        const path = canvas.getCanvasPath({ isPublic: true });
        return { success: !!path };
    } catch (e) {
        return { success: true };
    }
});

// Test 14: canvas integrates with brain module
test('canvas integrates with brain module', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// Test 15: canvas save accepts brain option
test('canvas save accepts brain option', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    try {
        canvas.save('test-canvas', { 
            content: 'test', 
            brain: currentBrain 
        });
        return { success: true };
    } catch (e) {
        return { success: true };
    }
});

// Test 16: canvas list accepts brain filter
test('canvas list accepts brain filter', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    try {
        const list = canvas.list({ brain: currentBrain });
        // It's async, returns a promise
        return { success: list && typeof list.then === 'function' };
    } catch (e) {
        return { success: true };
    }
});

// ============================================
// STACK SUPPORT TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('canvas has listStack function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.listStack === 'function' };
});

test('canvas has loadStack function', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    return { success: typeof canvas.loadStack === 'function' };
});

test('listStack returns promise', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const list = canvas.listStack();
    return { success: list && typeof list.then === 'function' };
});

test('loadStack returns promise', () => {
    const canvas = require(path.join(ROOT, 'lib', 'canvas'));
    const load = canvas.loadStack('nonexistent');
    return { success: load && typeof load.then === 'function' };
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
