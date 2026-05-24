#!/usr/bin/env node
/**
 * VAF Module Unit Tests
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

console.log('\n🛡️  VAF MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('vaf module loads', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: !!vaf };
});

test('vaf has validateString function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.validateString === 'function' };
});

test('vaf has check function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.check === 'function' };
});

test('vaf has sanitize function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.sanitize === 'function' };
});

test('vaf has middleware function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.middleware === 'function' };
});

test('vaf has getStatus function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.getStatus === 'function' };
});

test('vaf has isOperationAllowed function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.isOperationAllowed === 'function' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);