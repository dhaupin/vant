#!/usr/bin/env node
/**
 * Escrow Module Unit Tests
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

console.log('\n🔐 ESCROW MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('escrow module loads', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: !!escrow };
});

test('escrow has Escrow class', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: !!escrow.Escrow };
});

test('escrow has create function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.create === 'function' };
});

test('escrow has canSpend function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.canSpend === 'function' };
});

test('escrow has hold function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.hold === 'function' };
});

test('escrow has release function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.release === 'function' };
});

test('escrow has requestApproval function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.requestApproval === 'function' };
});

test('escrow has approve function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.approve === 'function' };
});

test('escrow has isOpen function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.isOpen === 'function' };
});

test('escrow has getStatus function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.getStatus === 'function' };
});

test('escrow has isOperationAllowed function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.isOperationAllowed === 'function' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);