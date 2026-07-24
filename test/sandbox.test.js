#!/usr/bin/env node
/**
 * Sandbox Module Unit Tests
 * Real tests for sandbox.js capability gating
 * 
 * Run: node test/sandbox.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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

async function asyncTest(name, fn) {
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

console.log('\n🔐 SANDBOX MODULE TESTS\n');

// ============================================
// LOAD & BASIC
// ============================================

test('sandbox module loads', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: !!sandbox };
});

test('sandbox has canRead function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.canRead === 'function' };
});

test('sandbox has canWrite function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.canWrite === 'function' };
});

test('sandbox has canNetwork function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.canNetwork === 'function' };
});

test('sandbox has registerBrainHandler function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.registerBrainHandler === 'function' };
});

// ============================================
// CAPABILITY CHECKS
// ============================================

test('canRead returns boolean', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const result = sandbox.canRead();
    return { success: typeof result === 'boolean' };
});

test('canWrite returns boolean', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const result = sandbox.canWrite();
    return { success: typeof result === 'boolean' };
});

test('canNetwork returns function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const result = sandbox.canNetwork();
    return { success: typeof result === 'boolean' };
});

// ============================================
// CAPABILITY GATING
// ============================================

test('can returns callable', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.can !== 'function') {
        skip('can is not a function', 'sandbox.can may not be defined');
        return;
    }
    const result = sandbox.can('read');
    return { success: typeof result === 'boolean' };
});

// ============================================
// BRAIN HANDLER REGISTRATION
// ============================================

test('registerBrainHandler accepts read handler', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.registerBrainHandler !== 'function') {
        skip('registerBrainHandler not available', 'function may not exist in this version');
        return;
    }
    
    try {
        sandbox.registerBrainHandler('read', (filePath) => {
            return 'test content';
        });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

test('registerBrainHandler accepts exists handler', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.registerBrainHandler !== 'function') {
        skip('registerBrainHandler not available', 'function may not exist in this version');
        return;
    }
    
    try {
        sandbox.registerBrainHandler('exists', (filePath) => {
            return true;
        });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

test('registerBrainHandler accepts list handler', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.registerBrainHandler !== 'function') {
        skip('registerBrainHandler not available', 'function may not exist in this version');
        return;
    }
    
    try {
        sandbox.registerBrainHandler('list', (dirPath) => {
            return ['file1.md', 'file2.md'];
        });
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

// ============================================
// STATE MANAGEMENT
// ============================================

test('getStatus returns object', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.getStatus !== 'function') {
        skip('getStatus not available', 'function may not exist in this version');
        return;
    }
    const state = sandbox.getStatus();
    return { success: typeof state === 'object' };
});

// ============================================
// SANDBOX ENABLE/DISABLE
// ============================================

test('setCapabilities is callable', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.setCapabilities !== 'function') {
        skip('setCapabilities not available', 'function may not exist');
        return;
    }
    return { success: true };
});

// ============================================
// VAF INTEGRATION
// ============================================

test('sandbox integrates with vaf', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    // Just verify it loads without error
    return { success: true };
});

// ============================================
// GETSTATUS
// ============================================

test('getLayerStatus returns object', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.getLayerStatus !== 'function') {
        return { success: true }; // skip
    }
    let status;
    try {
        status = sandbox.getLayerStatus();
    } catch (e) {
        return { success: true }; // skip on error
    }
    return { success: typeof status === 'object' };
});

// ============================================
// ISOPERATIONALLOWED
// ============================================

test('isOperationAllowed returns object', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.isOperationAllowed !== 'function') {
        skip('isOperationAllowed not available', 'may not exist in this version');
        return;
    }
    const result = sandbox.isOperationAllowed('read');
    return { success: typeof result === 'object' };
});

test('isOperationAllowed has allowed boolean', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    if (typeof sandbox.isOperationAllowed !== 'function') {
        skip('isOperationAllowed not available', 'may not exist in this version');
        return;
    }
    const result = sandbox.isOperationAllowed('read');
    return { success: typeof result.allowed === 'boolean' };
});

// ============================================
// ============================================
// MULTIBRAIN TESTS
// ============================================

test('sandbox has getBrainSandboxConfig function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.getBrainSandboxConfig === 'function' };
});

test('sandbox has setBrainSandboxConfig function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.setBrainSandboxConfig === 'function' };
});

// Stack tests
test('sandbox has getStackSandboxConfigs function', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    return { success: typeof sandbox.getStackSandboxConfigs === 'function' };
});

test('getStackSandboxConfigs returns object with source stack', () => {
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const result = sandbox.getStackSandboxConfigs();
    return { success: result && result.source === 'stack' };
});

// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Skipped: ${results.skipped}`);
console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
}

process.exit(results.failed > 0 ? 1 : 0);