#!/usr/bin/env node
/**
 * MCP Module Unit Tests
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

console.log('\n🔌 MCP MODULE TESTS\n');

test('mcp module loads', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: !!mcp };
});

test('mcp has start function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.start === 'function' };
});

test('mcp has stop function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.stop === 'function' };
});

test('mcp has listTools function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.listTools === 'function' };
});

test('mcp has methods', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.methods === 'object' };
});

test('mcp has addMethod function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.addMethod === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);