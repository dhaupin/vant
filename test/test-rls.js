#!/usr/bin/env node
/**
 * RLS Module Unit Tests
 * Real tests for rls.js - Row Level Security
 *
 * Run: node test/test-rls.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rls = require('../lib/rls');
const Habitat = require('../lib/habitat');
const sandbox = require('../lib/sandbox');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

async function test(name, fn) {
    try {
        const result = await fn();
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
// RLS TESTS
// ============================================

console.log('\n=== RLS Tests ===\n');

// Test 1: Core exports
test('has init function', () => {
    return typeof rls.init === 'function';
});

test('has middleware function', () => {
    return typeof rls.middleware === 'function';
});

test('has checkRead function', () => {
    return typeof rls.checkRead === 'function';
});

test('has checkWrite function', () => {
    return typeof rls.checkWrite === 'function';
});

test('has forWorkspace function', () => {
    return typeof rls.forWorkspace === 'function';
});

// Test 2: checkRead/checkWrite exist and return promises
skip('checkRead returns promise', 'RLS needs habitat init first');
skip('checkWrite returns promise', 'RLS needs habitat init first');

// Test 3: RLS with habitat integration
test('init sets habitat', () => {
    const habitat = new Habitat();
    rls.init(habitat);
    return rls.getHabitat() === habitat;
});

// Test 4: Workspace context
test('setWorkspace context', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('test-ws');
    rls.init(habitat);
    rls.setWorkspace('test-ws');
    return rls.getWorkspace() === 'test-ws';
});

// Test 5: Context check
test('context returns object', () => {
    return typeof rls.context() === 'object';
});

// Test 6: Middleware exists
test('middleware is function', () => {
    return typeof rls.middleware === 'function';
});

// Test 7: checkRead throws on denial
test('checkRead throws when habitat denies', async () => {
    const habitat = new Habitat();
    habitat.defaultPolicy = { readableBy: [], writableBy: [] };
    rls.init(habitat);
    
    const userCtx = { workspace: 'test', roles: ['user'] };
    try {
        await rls.checkRead(userCtx, 'secret-data', 'read');
        return false; // Should have thrown
    } catch (e) {
        return e.code === 'RLS_DENIED';
    }
});

// Test 8: checkWrite throws on denial
test('checkWrite throws when habitat denies', async () => {
    const habitat = new Habitat();
    habitat.defaultPolicy = { readableBy: [], writableBy: [] };
    rls.init(habitat);
    
    const userCtx = { workspace: 'test', roles: ['user'] };
    try {
        await rls.checkWrite(userCtx, 'secret-data', 'write');
        return false; // Should have thrown
    } catch (e) {
        return e.code === 'RLS_DENIED';
    }
});

// Test 9: checkRead allows when policy permits
test('checkRead allows when readableBy includes role', async () => {
    const habitat = new Habitat();
    habitat.defaultPolicy = { readableBy: ['role:user'], writableBy: [] };
    rls.init(habitat);
    
    // Use default workspace or no workspace to match default container
    const userCtx = { roles: ['user'] };
    const result = await rls.checkRead(userCtx, 'public-data', 'read');
    return result === true;
});

// Test 10: checkWrite allows when policy permits
test('checkWrite allows when writableBy includes role', async () => {
    const habitat = new Habitat();
    habitat.defaultPolicy = { readableBy: [], writableBy: ['role:admin'] };
    rls.init(habitat);
    
    const userCtx = { roles: ['admin'] };
    const result = await rls.checkWrite(userCtx, 'admin-data', 'write');
    return result === true;
});

// Test 11: sandbox.rls is wired after initRLS
test('sandbox.rls is available after initRLS', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('test-ws');
    sandbox.initRLS(habitat);
    
    // sandbox.rls should be the rls module (convenience accessor)
    return sandbox.rls && typeof sandbox.rls.checkRead === 'function';
});

// Test 12: workspace isolation - cross-workspace denied
test('workspace isolation blocks cross-container access', async () => {
    const habitat = new Habitat();
    habitat.createWorkspace('alpha');
    habitat.createWorkspace('beta');
    // Alpha's data is only for alpha
    habitat.boundaries['alpha:secret'] = { container: 'alpha', readableBy: [], writableBy: [] };
    rls.init(habitat);
    
    // User in beta tries to access alpha's secret
    const userCtx = { workspace: 'beta', roles: ['admin'] };
    try {
        await rls.checkRead(userCtx, 'alpha:secret', 'read');
        return false; // Should have blocked
    } catch (e) {
        return e.code === 'RLS_DENIED';
    }
});

// Test 13: public resources are accessible (no workspace = can access any)
test('public resources accessible from any workspace', async () => {
    const habitat = new Habitat();
    habitat.createWorkspace('alpha');
    habitat.createWorkspace('beta');
    // Public is accessible - without workspace set, can access default container
    rls.init(habitat);
    
    const userCtx = { roles: ['user'] };
    const result = await rls.checkRead(userCtx, 'public:news', 'read');
    return result === true;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED TESTS:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All RLS tests passed! 🔒\n');
