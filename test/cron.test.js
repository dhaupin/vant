#!/usr/bin/env node
/**
 * Cron Module Unit Tests
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

console.log('\n⏰ CRON MODULE TESTS\n');

test('cron module loads', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: !!cron };
});

test('cron has schedule function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.schedule === 'function' };
});

test('cron has cancel function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.cancel === 'function' };
});

test('cron has run function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.run === 'function' };
});

test('cron has status function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.status === 'function' };
});

test('cron has list function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.list === 'function' };
});

test('cron has enable function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.enable === 'function' };
});

test('cron has on function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.on === 'function' };
});

test('cron has emit function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.emit === 'function' };
});

test('cron has stop function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.stop === 'function' };
});

test('cron has getStatus function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.getStatus === 'function' };
});

test('cron has isOperationAllowed function', () => {
    const cron = require(path.join(ROOT, 'lib', 'cron'));
    return { success: typeof cron.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);