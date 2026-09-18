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

// Test 2: Default capabilities
// v0.9.0-axolotl: the default sandbox is now allow-by-default for
// canRead/canWrite/canExec (agents need to do work in the trusted
// runtime). canNetwork is still false by default (network is the
// explicit, gated capability). Use `sandbox.create({ canRead: false,
// canWrite: false, canExec: false })` for a restricted sandbox.
test('canRead default true', () => {
    return sandbox.canRead() === true;
});

test('canWrite default true', () => {
    return sandbox.canWrite() === true;
});

test('canNetwork default false', () => {
    return sandbox.canNetwork() === false;
});

test('canExec default true', () => {
    return sandbox.canExec() === true;
});

test('restricted sandbox canRead false', () => {
    // Demonstrates the explicit-deny path: callers who want a
    // deny-by-default sandbox must opt in via `sandbox.create()`
    // with `capabilities: { canRead: false }` and `scopes: []`.
    const restricted = sandbox.create({
        capabilities: { canRead: false, canWrite: false, canExec: false },
        scopes: []
    });
    return restricted.can('canRead') === false;
});

test('restricted sandbox canWrite false', () => {
    const restricted = sandbox.create({
        capabilities: { canRead: false, canWrite: false, canExec: false },
        scopes: []
    });
    return restricted.can('canWrite') === false;
});

test('restricted sandbox canExec false', () => {
    const restricted = sandbox.create({
        capabilities: { canRead: false, canWrite: false, canExec: false },
        scopes: []
    });
    return restricted.can('canExec') === false;
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
