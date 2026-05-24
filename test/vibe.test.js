#!/usr/bin/env node
/**
 * Vibe Module Unit Tests
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

console.log('\n🎵 VIBE MODULE TESTS\n');

test('vibe module loads', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: !!vibe };
});

test('vibe has getMood function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.getMood === 'function' };
});

test('vibe has setMood function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.setMood === 'function' };
});

test('vibe has getVibeConfig function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.getVibeConfig === 'function' };
});

test('vibe has onTaskSuccess function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.onTaskSuccess === 'function' };
});

test('vibe has onTaskError function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.onTaskError === 'function' };
});

test('vibe has getCommitVibe function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.getCommitVibe === 'function' };
});

test('vibe has getAvailableVibes function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.getAvailableVibes === 'function' };
});

test('vibe has isCautious function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.isCautious === 'function' };
});

test('vibe has isCreative function', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.isCreative === 'function' };
});

test('vibe has VIBES object', () => {
    const vibe = require(path.join(ROOT, 'lib', 'vibe'));
    return { success: typeof vibe.VIBES === 'object' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);