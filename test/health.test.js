#!/usr/bin/env node
/**
 * Health Module Unit Tests
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

console.log('\n💚 HEALTH MODULE TESTS\n');

test('health module loads', () => {
    const health = require(path.join(ROOT, 'lib', 'health'));
    return { success: !!health };
});

test('health has start function', () => {
    const health = require(path.join(ROOT, 'lib', 'health'));
    return { success: typeof health.start === 'function' };
});

test('health has stop function', () => {
    const health = require(path.join(ROOT, 'lib', 'health'));
    return { success: typeof health.stop === 'function' };
});

test('health has runChecks function', () => {
    const health = require(path.join(ROOT, 'lib', 'health'));
    return { success: typeof health.runChecks === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);