#!/usr/bin/env node
/**
 * Branch Module Unit Tests
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

console.log('\n🌿 BRANCH MODULE TESTS\n');

test('branch module loads', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: !!branch };
});

test('branch has currentBranch function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.currentBranch === 'function' };
});

test('branch has listBranches function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.listBranches === 'function' };
});

test('branch has checkout function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.checkout === 'function' };
});

test('branch has commit function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.commit === 'function' };
});

test('branch has push function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.push === 'function' };
});

test('branch has merge function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.merge === 'function' };
});

test('branch has status function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.status === 'function' };
});

test('branch has deleteBranch function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.deleteBranch === 'function' };
});

test('branch has createPR function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.createPR === 'function' };
});

test('branch has getStatus function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.getStatus === 'function' };
});

// Multibrain tests
test('branch has getBrainBranchConfig function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.getBrainBranchConfig === 'function' };
});

test('branch has setBrainBranchConfig function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.setBrainBranchConfig === 'function' };
});

// Stack tests
test('branch has getStackBranchConfigs function', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    return { success: typeof branch.getStackBranchConfigs === 'function' };
});

test('getStackBranchConfigs returns object with source stack', () => {
    const branch = require(path.join(ROOT, 'lib', 'branch'));
    const result = branch.getStackBranchConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);