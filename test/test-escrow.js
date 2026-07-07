#!/usr/bin/env node
/**
 * Escrow Module Unit Tests
 * Real tests for escrow.js budget management
 *
 * Run: node test/test-escrow.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { Escrow } = require('../lib/escrow');

// Test results
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

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

async function asyncTest(name, fn) {
    try {
        const result = await fn();
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

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

// ============================================
// TESTS
// ============================================

console.log('\n=== Escrow Tests ===\n');

// Test 1: Basic creation
test('create escrow instance', () => {
    const escrow = new Escrow();
    return escrow !== undefined;
});

test('set budget', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 500);
    return escrow._budgets.get('agent-1') !== undefined;
});

// Test 2: canSpend
test('canSpend - allowed', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 500);
    return escrow.canSpend('agent-1', 100).allowed === true;
});

test('canSpend - exceeded', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 50);
    return escrow.canSpend('agent-1', 100).allowed === false;
});

// Test 3: recordSpend
test('recordSpend', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 500);
    escrow.recordSpend('agent-1', 100);
    return escrow._budgets.get('agent-1').spent === 100;
});

// Test 4: beforeExecute (ctx API)
asyncTest('beforeExecute returns result', async () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 500);
    const result = await escrow.beforeExecute({ agentId: 'agent-1', cost: 100 });
    return result.allowed === true;
});

// Test 5: Agent isolation
test('agent isolation', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 500);
    escrow.setBudget('agent-2', 200);
    
    return escrow.canSpend('agent-1', 100).allowed === true &&
           escrow.canSpend('agent-2', 100).allowed === true &&
           escrow.canSpend('agent-1', 600).allowed === false;
});

// Test 6: Quota check
test('quota check', () => {
    const escrow = new Escrow();
    escrow.setBudget('agent-1', 1000);
    
    return escrow.canSpend('agent-1', 500).allowed === true;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All escrow tests passed! 🎉\n');
