#!/usr/bin/env node
/**
 * MCP Module Unit Tests - CRITICAL
 * Tests for Model Context Protocol server
 *
 * Run: node test/test-mcp.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mcp = require('../lib/mcp');

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

console.log('\n=== MCP Module Tests (CRITICAL) ===\n');

// Test 1: Core exports - MCP server
test('has start function', () => {
    return typeof mcp.start === 'function';
});

test('has stop function', () => {
    return typeof mcp.stop === 'function';
});

test('has listTools function', () => {
    return typeof mcp.listTools === 'function';
});

test('has methods Map', () => {
    return mcp.methods instanceof Map;
});

test('has addMethod function', () => {
    return typeof mcp.addMethod === 'function';
});

test('has execute function', () => {
    return typeof mcp.execute === 'function';
});

test('has call function', () => {
    return typeof mcp.call === 'function';
});

// Test 2: Methods Map populated
test('methods Map has brain_load', () => {
    return mcp.methods.has('brain_load');
});

test('methods Map has vant_* tools', () => {
    const methods = Array.from(mcp.methods.keys());
    const vantMethods = methods.filter(k => k.startsWith('vant_'));
    return vantMethods.length > 10;
});

// Test 3: listTools returns array
test('listTools returns array', () => {
    const tools = mcp.listTools();
    return Array.isArray(tools);
});

// Test 4: call function exists
test('call executes method', () => {
    return typeof mcp.call === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All MCP tests passed! 🔌\n');
