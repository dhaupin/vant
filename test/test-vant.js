#!/usr/bin/env node
/**
 * Vant Module Unit Tests - CRITICAL
 * Tests for the main Vant facade/export
 *
 * Run: node test/test-vant.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const vant = require('../lib/vant');

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

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

console.log('\n=== Vant Module Tests (CRITICAL) ===\n');

// Test 1: Core exports
test('has version property', () => {
    return typeof vant.version === 'string';
});

test('has init function', () => {
    return typeof vant.init === 'function';
});

test('has startFull function', () => {
    return typeof vant.startFull === 'function';
});

test('has startHeadless function', () => {
    return typeof vant.startHeadless === 'function';
});

test('has shutdown function', () => {
    return typeof vant.shutdown === 'function';
});

test('has think function', () => {
    return typeof vant.think === 'function';
});

test('has learn function', () => {
    return typeof vant.learn === 'function';
});

test('has remember function', () => {
    return typeof vant.remember === 'function';
});

test('has act function', () => {
    return typeof vant.act === 'function';
});

test('has getState function', () => {
    return typeof vant.getState === 'function';
});

test('has getStatus function', () => {
    return typeof vant.getStatus === 'function';
});

// Test 2: Sub-modules exposed (function or object — accept either)
test('has brain export', () => {
    return vant.brain !== undefined && typeof vant.brain === 'object';
});

test('has search function', () => {
    return vant.search !== undefined && typeof vant.search === 'object';
});

test('has islands export', () => {
    return vant.islands !== undefined && typeof vant.islands === 'object';
});

test('has config export', () => {
    return typeof vant.config === 'function';
});

test('has lock export', () => {
    return typeof vant.lock === 'function';
});

test('has audit export', () => {
    return vant.audit !== undefined && typeof vant.audit === 'object';
});

test('has event export', () => {
    return typeof vant.event === 'object';
});

test('has msg export', () => {
    return vant.msg !== undefined && typeof vant.msg === 'object';
});

test('has metrics export', () => {
    return typeof vant.metrics === 'function';
});

test('has mcp export', () => {
    return vant.mcp !== undefined && typeof vant.mcp === 'object';
});

test('has compute export', () => {
    return typeof vant.compute === 'function';
});

test('has sandbox export', () => {
    return typeof vant.sandbox === 'function';
});

test('has storage export', () => {
    return vant.storage !== undefined && typeof vant.storage === 'object';
});

test('has stego export', () => {
    return typeof vant.stego === 'function';
});

test('has encrypt export', () => {
    return typeof vant.encrypt === 'function';
});

test('has embed export', () => {
    return typeof vant.embed === 'function';
});

test('has citations export', () => {
    return typeof vant.citations === 'function';
});

test('has connector export', () => {
    return typeof vant.connector === 'function';
});

test('has framework export', () => {
    return typeof vant.framework === 'function';
});

test('has habitat function', () => {
    return typeof vant.habitat === 'function';
});

test('has system function', () => {
    return typeof vant.system === 'function';
});

test('has getTools function', () => {
    return typeof vant.getTools === 'function';
});

test('has executeTool function', () => {
    return typeof vant.executeTool === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All Vant tests passed! 🧠\n');
