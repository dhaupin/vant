#!/usr/bin/env node
/**
 * Stream Module Unit Tests
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

console.log('\n🌊 STREAM MODULE TESTS\n');

test('stream module loads', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: !!stream };
});

test('stream has init function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.init === 'function' };
});

test('stream has enqueue function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.enqueue === 'function' };
});

test('stream has poll function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.poll === 'function' };
});

test('stream has complete function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.complete === 'function' };
});

test('stream has fail function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.fail === 'function' };
});

test('stream has list function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.list === 'function' };
});

test('stream has info function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.info === 'function' };
});

test('stream has load function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.load === 'function' };
});

test('stream has create function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.create === 'function' };
});

test('stream has deleteStream function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.deleteStream === 'function' };
});

test('stream has peek function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.peek === 'function' };
});

test('stream has stats function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.stats === 'function' };
});

test('stream has lease function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.lease === 'function' };
});

test('stream has release function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.release === 'function' };
});

test('stream has watch function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.watch === 'function' };
});

test('stream has emit function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.emit === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('stream has listStack function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.listStack === 'function' };
});

test('stream has getStackStreamInfo function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.getStackStreamInfo === 'function' };
});

test('stream has getStackStats function', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    return { success: typeof stream.getStackStats === 'function' };
});

test('listStack returns array', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    const streams = stream.listStack();
    return { success: Array.isArray(streams) };
});

test('getStackStats returns object with source stack', () => {
    const stream = require(path.join(ROOT, 'lib', 'stream'));
    const stats = stream.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);