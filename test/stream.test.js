#!/usr/bin/env node
/**
 * Stream Module Unit Tests
 */

const path = require('path');
const fs = require('fs');
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

// ==================== v0.9.0-axolotl T9 ====================

test('stream has _getSecurity bundle helper (T9)', () => {
    // Read the source; _getSecurity should exist and return all 5 modules
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasGetSecurity = src.includes('function _getSecurity()');
    const returnsFive = /function _getSecurity\(\)\s*\{[\s\S]{0,500}encrypt/.test(src);
    return {
        success: hasGetSecurity && returnsFive,
        error: !hasGetSecurity ? 'no _getSecurity' : !returnsFive ? 'missing encrypt in bundle' : null
    };
});

test('stream _gate uses _getSecurity bundle (T9)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    // Find _gate body — match up to the next standalone "function" or end of file
    const gateStart = src.indexOf('async function _gate(');
    if (gateStart === -1) return { success: false, error: 'no _gate found' };
    // Take a chunk from _gate to the next standalone function decl
    const chunk = src.slice(gateStart, gateStart + 800);
    const usesGetSecurity = chunk.includes('_getSecurity()');
    const oldGetterCount = (chunk.match(/_getSandbox\(\)|_getVaf\(\)|_getQoS\(\)|_getEscrow\(\)/g) || []).length;
    return {
        success: usesGetSecurity && oldGetterCount === 0,
        error: !usesGetSecurity ? '_gate does not use _getSecurity()' : oldGetterCount > 0 ? `_gate still uses ${oldGetterCount} old getters` : null
    };
});

// ==================== v0.9.0-axolotl T9b ====================
// Nuclear breaking: 5 individual _get* getters removed. 0.8.6 → 1.0.0 is a
// fresh foundation; no backward-compat wrappers.

test('stream has no _getSandbox getter (T9b)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasOldGetter = /function\s+_getSandbox\s*\(/.test(src);
    return { success: !hasOldGetter, error: hasOldGetter ? '_getSandbox still defined' : null };
});

test('stream has no _getVaf getter (T9b)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasOldGetter = /function\s+_getVaf\s*\(/.test(src);
    return { success: !hasOldGetter, error: hasOldGetter ? '_getVaf still defined' : null };
});

test('stream has no _getQoS getter (T9b)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasOldGetter = /function\s+_getQoS\s*\(/.test(src);
    return { success: !hasOldGetter, error: hasOldGetter ? '_getQoS still defined' : null };
});

test('stream has no _getEscrow getter (T9b)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasOldGetter = /function\s+_getEscrow\s*\(/.test(src);
    return { success: !hasOldGetter, error: hasOldGetter ? '_getEscrow still defined' : null };
});

test('stream has no _getEncrypt getter (T9b)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'stream.js'), 'utf8');
    const hasOldGetter = /function\s+_getEncrypt\s*\(/.test(src);
    return { success: !hasOldGetter, error: hasOldGetter ? '_getEncrypt still defined' : null };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);