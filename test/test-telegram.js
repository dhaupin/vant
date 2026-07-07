#!/usr/bin/env node
/**
 * Telegram Module Unit Tests
 *
 * Run: node test/test-telegram.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const telegram = require('../lib/telegram');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n=== Telegram Module Tests ===\n');

test('has send function', () => { return typeof telegram.send === 'function'; });
test('has sendHTML function', () => { return typeof telegram.sendHTML === 'function'; });
test('has sendMarkdown function', () => { return typeof telegram.sendMarkdown === 'function'; });
test('has sendLocation function', () => { return typeof telegram.sendLocation === 'function'; });
test('has sendPhoto function', () => { return typeof telegram.sendPhoto === 'function'; });
test('has onCommand function', () => { return typeof telegram.onCommand === 'function'; });
test('has onMessage function', () => { return typeof telegram.onMessage === 'function'; });
test('has startPolling function', () => { return typeof telegram.startPolling === 'function'; });
test('has stopPolling function', () => { return typeof telegram.stopPolling === 'function'; });

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) process.exit(1);
console.log('All telegram tests passed! 📱\n');
