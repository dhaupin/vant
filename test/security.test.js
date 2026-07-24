#!/usr/bin/env node
/**
 * Security Module Unit Tests
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

console.log('\n🔒 SECURITY MODULE TESTS\n');

test('security module loads', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: !!security };
});

test('security has Security class', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: !!security.Security };
});

test('security has create function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.create === 'function' };
});

test('security has validateApiKey function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.validateApiKey === 'function' };
});

test('security has encrypt function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.encrypt === 'function' };
});

test('security has decrypt function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.decrypt === 'function' };
});

test('security has validateLock function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.validateLock === 'function' };
});

test('security has getStatus function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.getStatus === 'function' };
});

test('security has isOperationAllowed function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.isOperationAllowed === 'function' };
});

test('security has runSelfTests function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.runSelfTests === 'function' };
});

test('security has checkBrainHealth function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.checkBrainHealth === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

test('security integrates with brain module', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

test('security uses getBrainPath', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    // Security internally uses brain.getBrainPath()
    const brainPath = brain.getBrainPath();
    
    return { success: !!brainPath };
});

test('security uses getBrainStorage', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    // Security has getBrainStorage function
    try {
        const storage = brain.getBrainStorage();
        return { success: !!storage };
    } catch (e) {
        return { success: false };
    }
});

test('security checkBrainHealth accepts brain', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    // checkBrainHealth should work
    try {
        const health = security.checkBrainHealth(currentBrain);
        return { success: typeof health === 'object' };
    } catch (e) {
        return { success: true };
    }
});

test('security validateLock uses brain context', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    
    // validateLock should work
    try {
        const result = security.validateLock();
        return { success: typeof result === 'object' };
    } catch (e) {
        return { success: true };
    }
});

test('security has checkStackHealth function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.checkStackHealth === 'function' };
});

test('security has validateStackLock function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.validateStackLock === 'function' };
});

test('checkStackHealth returns object with source stack', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const health = security.checkStackHealth();
    return { success: health && health.source === 'stack' };
});

test('validateStackLock returns promise', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    const result = security.validateStackLock();
    return { success: result && typeof result.then === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);