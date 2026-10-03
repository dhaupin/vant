#!/usr/bin/env node
/**
 * Backup Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

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

console.log('\n💨 BACKUP MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('backup module loads', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: !!backup };
});

// ============================================
// EXPORTS
// ============================================

test('backup has getInstance function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.getInstance === 'function' };
});

test('backup has start function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.start === 'function' };
});

test('backup has stop function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.stop === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('backup has getBrainBackupConfig function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.getBrainBackupConfig === 'function' };
});

test('backup has setBrainBackupConfig function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.setBrainBackupConfig === 'function' };
});

// Stack tests
test('backup has getStackBackupConfigs function', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.getStackBackupConfigs === 'function' };
});

test('getStackBackupConfigs returns object with source stack', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    const result = backup.getStackBackupConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);
