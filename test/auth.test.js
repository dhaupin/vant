#!/usr/bin/env node
/**
 * Auth Module Unit Tests
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

console.log('\n🔑 AUTH MODULE TESTS\n');

test('auth module loads', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth };
});

test('auth has Auth class', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth.Auth };
});

test('auth is object', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: typeof auth === 'object' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);