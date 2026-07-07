#!/usr/bin/env node
/**
 * API Module Unit Tests - CRITICAL
 * Tests for the public API layer
 *
 * Run: node test/test-api.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const api = require('../lib/api');

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

console.log('\n=== API Module Tests (CRITICAL) ===\n');

// Test 1: Core exports
test('has API class', () => {
    return typeof api.API === 'function';
});

test('has create function', () => {
    return typeof api.create === 'function';
});

test('has execute function', () => {
    return typeof api.execute === 'function';
});

test('has read function', () => {
    return typeof api.read === 'function';
});

test('has write function', () => {
    return typeof api.write === 'function';
});

test('has call function', () => {
    return typeof api.call === 'function';
});

test('has brain function', () => {
    return typeof api.brain === 'function';
});

test('has brainList function', () => {
    return typeof api.brainList === 'function';
});

test('has brainCorpus function', () => {
    return typeof api.brainCorpus === 'function';
});

test('has brainState function', () => {
    return typeof api.brainState === 'function';
});

test('has islands function', () => {
    return typeof api.islands === 'function';
});

test('has islandsList function', () => {
    return typeof api.islandsList === 'function';
});

test('has citationsList function', () => {
    return typeof api.citationsList === 'function';
});

test('has citationsAdd function', () => {
    return typeof api.citationsAdd === 'function';
});

test('has connectorList function', () => {
    return typeof api.connectorList === 'function';
});

test('has frameworkStatus function', () => {
    return typeof api.frameworkStatus === 'function';
});

test('has init function', () => {
    return typeof api.init === 'function';
});

test('has detectMode function', () => {
    return typeof api.detectMode === 'function';
});

test('has setMode function', () => {
    return typeof api.setMode === 'function';
});

test('has getMode function', () => {
    return typeof api.getMode === 'function';
});

test('has getStatus function', () => {
    return typeof api.getStatus === 'function';
});

test('has getLayerStatus function', () => {
    return typeof api.getLayerStatus === 'function';
});

test('has startMCP function', () => {
    return typeof api.startMCP === 'function';
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All API tests passed! 🌐\n');
