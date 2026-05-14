#!/usr/bin/env node
/**
 * Version Module Unit Tests
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

console.log('\n🏷️  VERSION MODULE TESTS\n');

test('version module loads', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: !!version };
});

test('version exports array-like', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: Array.isArray(version) };
});

test('version has 5 elements', () => {
    const version = require(path.join(ROOT, 'lib', 'version'));
    return { success: version.length === 5 };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);