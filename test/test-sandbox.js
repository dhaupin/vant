#!/usr/bin/env node
/**
 * Sandbox Module Unit Tests
 * Real tests for sandbox.js capability gating
 *
 * Run: node test/test-sandbox.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sandbox = require('../lib/sandbox');
const Habitat = require('../lib/habitat');

// Test results
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

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

// ============================================
// TESTS
// ============================================

console.log('\n=== Sandbox Tests ===\n');

// Test 1: Core exports
test('has initRLS', () => {
    return typeof sandbox.initRLS === 'function';
});

test('has generateCaps', () => {
    return typeof sandbox.generateCaps === 'function';
});

test('has initLegal', () => {
    return typeof sandbox.initLegal === 'function';
});

// Test 2: Default capabilities (DENY)
test('canRead default false', () => {
    return sandbox.canRead() === false;
});

test('canWrite default false', () => {
    return sandbox.canWrite() === false;
});

test('canNetwork default false', () => {
    return sandbox.canNetwork() === false;
});

test('canExec default false', () => {
    return sandbox.canExec() === false;
});

// Test 3: Generate caps
test('generateCaps returns object', () => {
    const caps = sandbox.generateCaps({});
    return typeof caps === 'object';
});

// Test 4: Create sandbox
test('create with caps', () => {
    const sb = sandbox.create({
        canRead: true,
        canWrite: true
    });
    return sb.capabilities.canRead === true &&
           sb.capabilities.canWrite === true;
});

test('createAllowed returns object', () => {
    return typeof sandbox.createAllowed() === 'object';
});

// Test 5: initRLS
test('initRLS with habitat', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    return sandbox.initRLS(habitat) === true;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All sandbox tests passed! 🎉\n');
