#!/usr/bin/env node
/**
 * Update Module Unit Tests
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

console.log('\n🔄 UPDATE MODULE TESTS\n');

test('update module loads', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: !!update };
});

test('update has getVersion function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getVersion === 'function' };
});

test('update has compareVersions function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.compareVersions === 'function' };
});

test('update has CURRENT_VERSION', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.CURRENT_VERSION === 'string' };
});

test('update has checkForUpdate function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.checkForUpdate === 'function' };
});

test('update has getLatestRelease function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getLatestRelease === 'function' };
});

test('update has addMessage function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.addMessage === 'function' };
});

test('update has getContextTokens function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getContextTokens === 'function' };
});

test('update has shouldUpdate function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.shouldUpdate === 'function' };
});

test('update has generateSummary function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.generateSummary === 'function' };
});

test('update has writeToBrain function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.writeToBrain === 'function' };
});

test('update has pushToGitHub function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.pushToGitHub === 'function' };
});

test('update has stats function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.stats === 'function' };
});

test('update has reset function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.reset === 'function' };
});

test('update has saveOnExit function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.saveOnExit === 'function' };
});

test('update has getSessionSummary function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getSessionSummary === 'function' };
});

test('update has getStatus function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getStatus === 'function' };
});

test('update has isOperationAllowed function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('update has getStackUpdateStatus function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getStackUpdateStatus === 'function' };
});

test('update has getStackVersions function', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    return { success: typeof update.getStackVersions === 'function' };
});

test('getStackUpdateStatus returns object with source stack', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    const status = update.getStackUpdateStatus();
    return { success: status && status.source === 'stack' };
});

test('getStackVersions returns object with source stack', () => {
    const update = require(path.join(ROOT, 'lib', 'update'));
    const versions = update.getStackVersions();
    return { success: versions && versions.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);