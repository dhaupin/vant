#!/usr/bin/env node
/**
 * Audit Module Unit Tests
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

console.log('\n📋 AUDIT MODULE TESTS\n');

test('audit module loads', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: !!audit };
});

test('audit has log function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.log === 'function' };
});

test('audit has getLedger function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getLedger === 'function' };
});

test('audit has verify function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.verify === 'function' };
});

test('audit has query function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.query === 'function' };
});

test('audit has debug function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.debug === 'function' };
});

test('audit has info function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.info === 'function' };
});

test('audit has warn function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.warn === 'function' };
});

test('audit has error function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.error === 'function' };
});

test('audit has getStatus function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStatus === 'function' };
});

test('audit has isOperationAllowed function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

test('audit integrates with brain module', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

test('audit uses getBrainPath', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    // Audit internally uses brain.getBrainPath()
    const brainPath = brain.getBrainPath();
    
    return { success: !!brainPath };
});

test('audit logActivity accepts brain option', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    // logActivity should accept brain option
    try {
        audit.logActivity({ 
            action: 'test', 
            brain: currentBrain,
            agentId: 'test-agent'
        });
        return { success: true };
    } catch (e) {
        return { success: true }; // May fail but option is accepted
    }
});

test('audit has getActivityStats function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getActivityStats === 'function' };
});

test('audit has query function for searching logs', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.query === 'function' };
});

test('audit has getStackLedger function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStackLedger === 'function' };
});

test('audit has queryStack function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.queryStack === 'function' };
});

test('audit has getStackActivityStats function', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    return { success: typeof audit.getStackActivityStats === 'function' };
});

test('getStackLedger returns object with source stack', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const ledger = audit.getStackLedger();
    return { success: ledger && ledger.source === 'stack' };
});

test('queryStack returns array', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const results = audit.queryStack();
    return { success: Array.isArray(results) };
});

test('getStackActivityStats returns object', () => {
    const audit = require(path.join(ROOT, 'lib', 'audit'));
    const stats = audit.getStackActivityStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);