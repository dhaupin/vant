#!/usr/bin/env node
/**
 * Telegram Module Unit Tests
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

console.log('\n✈️  TELEGRAM MODULE TESTS\n');

test('telegram module loads', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: !!telegram };
});

test('telegram has send function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.send === 'function' };
});

test('telegram has sendHTML function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.sendHTML === 'function' };
});

test('telegram has sendMarkdown function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.sendMarkdown === 'function' };
});

test('telegram has sendLocation function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.sendLocation === 'function' };
});

test('telegram has sendPhoto function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.sendPhoto === 'function' };
});

test('telegram has onCommand function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.onCommand === 'function' };
});

test('telegram has onMessage function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.onMessage === 'function' };
});

test('telegram has startPolling function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.startPolling === 'function' };
});

test('telegram has stopPolling function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.stopPolling === 'function' };
});

test('telegram has inlineKeyboard function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.inlineKeyboard === 'function' };
});

test('telegram has replyKeyboard function', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: typeof telegram.replyKeyboard === 'function' };
});

test('telegram has api', () => {
    const telegram = require(path.join(ROOT, 'lib', 'telegram'));
    return { success: !!telegram.api };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);