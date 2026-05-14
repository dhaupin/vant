#!/usr/bin/env node
/**
 * Encrypt Module Unit Tests
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

console.log('\n🔒 ENCRYPT MODULE TESTS\n');

test('encrypt module loads', () => {
    const encrypt = require(path.join(ROOT, 'lib', 'encrypt'));
    return { success: !!encrypt };
});

test('encrypt has default export', () => {
    const encrypt = require(path.join(ROOT, 'lib', 'encrypt'));
    return { success: !!encrypt.default };
});

test('encrypt is object', () => {
    const encrypt = require(path.join(ROOT, 'lib', 'encrypt'));
    return { success: typeof encrypt === 'object' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);