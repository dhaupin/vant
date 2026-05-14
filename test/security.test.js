#!/usr/bin/env node
/**
 * Security Module Unit Tests
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

console.log('\n🔒 SECURITY MODULE TESTS\n');

test('security module loads', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: !!security };
});

test('security has Security class', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: !!security.Security };
});

test('security has create function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.create === 'function' };
});

test('security has validateApiKey function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.validateApiKey === 'function' };
});

test('security has encrypt function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.encrypt === 'function' };
});

test('security has decrypt function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.decrypt === 'function' };
});

test('security has validateLock function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.validateLock === 'function' };
});

test('security has getStatus function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.getStatus === 'function' };
});

test('security has isOperationAllowed function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.isOperationAllowed === 'function' };
});

test('security has runSelfTests function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.runSelfTests === 'function' };
});

test('security has checkBrainHealth function', () => {
    const security = require(path.join(ROOT, 'lib', 'security'));
    return { success: typeof security.checkBrainHealth === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);