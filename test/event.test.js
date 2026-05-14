#!/usr/bin/env node
/**
 * Event Module Unit Tests
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

console.log('\n� EVENT MODULE TESTS\n');

test('event module loads', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: !!event };
});

test('event has Event class', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: !!event.Event };
});

test('event has PubSub class', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: !!event.PubSub };
});

test('event has Queue class', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: !!event.Queue };
});

test('event has emit function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.emit === 'function' };
});

test('event has on function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.on === 'function' };
});

test('event has once function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.once === 'function' };
});

test('event has off function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.off === 'function' };
});

test('event has enqueue function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.enqueue === 'function' };
});

test('event has getStatus function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.getStatus === 'function' };
});

test('event has isOperationAllowed function', () => {
    const event = require(path.join(ROOT, 'lib', 'event'));
    return { success: typeof event.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);