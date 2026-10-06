#!/usr/bin/env node
/**
 * Msg Module Unit Tests
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

console.log('\n💬 MSG MODULE TESTS\n');

test('msg module loads', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: !!msg };
});

test('msg has Msg class', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: !!msg.Msg };
});

test('msg has create function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.create === 'function' };
});

test('msg has send function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.send === 'function' };
});

test('msg has post function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.post === 'function' };
});

test('msg has reply function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.reply === 'function' };
});

test('msg has messages function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.messages === 'function' };
});

test('msg has list function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.list === 'function' };
});

test('msg has delete function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.delete === 'function' };
});

test('msg has clear function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.clear === 'function' };
});

test('msg has getStatus function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStatus === 'function' };
});

test('msg has isOperationAllowed function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('msg has listStack function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.listStack === 'function' };
});

test('msg has getStackStats function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStackStats === 'function' };
});

test('msg has getStackMessages function', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    return { success: typeof msg.getStackMessages === 'function' };
});

test('listStack returns array', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    const convos = msg.listStack();
    return { success: Array.isArray(convos) };
});

test('getStackStats returns object with source stack', () => {
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    const stats = msg.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);