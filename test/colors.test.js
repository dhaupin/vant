#!/usr/bin/env node
/**
 * Colors Module Unit Tests
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

console.log('\n🌈 COLORS MODULE TESTS\n');

test('colors module loads', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: !!colors };
});

test('colors has primary function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.primary === 'function' };
});

test('colors has success function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.success === 'function' };
});

test('colors has warning function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.warning === 'function' };
});

test('colors has error function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.error === 'function' };
});

test('colors has info function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.info === 'function' };
});

test('colors has dim function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.dim === 'function' };
});

test('colors has bold function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.bold === 'function' };
});

test('colors has inverse function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.inverse === 'function' };
});

test('colors has vant', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.vant === 'string' };
});

test('colors has vantHeader', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.vantHeader === 'string' };
});

test('colors has section function', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.section === 'function' };
});

test('colors has ok', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.ok === 'string' };
});

test('colors has fail', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.fail === 'string' };
});

test('colors has warn', () => {
    const colors = require(path.join(ROOT, 'lib', 'colors'));
    return { success: typeof colors.warn === 'string' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);