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

test('encrypt is class or function', () => {
    const encrypt = require(path.join(ROOT, 'lib', 'encrypt'));
    return { success: typeof encrypt === 'function' || typeof encrypt === 'object' };
});

// ============================================
// ISSUE #188-A1: verify() answers, never throws
// ============================================

console.log('\n🧪 #188-A1 MALFORMED-HASH CONTRACT\n');

test('verify(x, "ab:cd") returns false, does not throw (short non-hex salt-hash)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    let threw = null, verdict;
    try { verdict = E.verify('x', 'ab:cd'); } catch (e) { threw = e; }
    return { success: threw === null && verdict === false,
        error: threw ? 'THREW: ' + threw.message : 'verdict ' + verdict };
});

test('verify(x, null) returns false, does not throw', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    let threw = null, verdict;
    try { verdict = E.verify('x', null); } catch (e) { threw = e; }
    return { success: threw === null && verdict === false,
        error: threw ? 'THREW: ' + threw.message : 'verdict ' + verdict };
});

test('verify with non-hex expected half returns false (shape ok, bytes invalid)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    return { success: E.verify('x', 'ab:zz') === false };
});

test('verify still accepts a REAL hash (roundtrip truth intact)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    const h = E.hash('pin data 206');
    return { success: E.verify('pin data 206', h) === true && E.verify('other', h) === false };
});

test('vant encrypt key emits 32-byte hex secret material (issue #186 bug 3)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    const k = E.key(32);
    return { success: /^[0-9a-f]{64}$/.test(k), error: 'key=' + JSON.stringify(k).slice(0, 80) };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);