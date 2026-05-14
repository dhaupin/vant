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

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);