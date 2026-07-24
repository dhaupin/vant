#!/usr/bin/env node
/**
 * Sync Module Unit Tests
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

console.log('\n🔄 SYNC MODULE TESTS\n');

test('sync module loads', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: !!sync };
});

test('sync has Sync class', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: !!sync.Sync };
});

test('sync has create function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.create === 'function' };
});

test('sync has pushAll function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.pushAll === 'function' };
});

test('sync has pullAny function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.pullAny === 'function' };
});

test('sync has getStatus function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getStatus === 'function' };
});

test('sync has isRAID function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.isRAID === 'function' };
});

test('sync has getProviderCount function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getProviderCount === 'function' };
});

test('sync has getConfiguredProviders function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getConfiguredProviders === 'function' };
});

test('sync has rebase function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.rebase === 'function' };
});

test('sync has markStale function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.markStale === 'function' };
});

test('sync has isCircuitClosed function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.isCircuitClosed === 'function' };
});

test('sync has getLayerStatus function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getLayerStatus === 'function' };
});

test('sync has isOperationAllowed function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('sync has getStackSyncStatus function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getStackSyncStatus === 'function' };
});

test('sync has getStackPrivacy function', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    return { success: typeof sync.getStackPrivacy === 'function' };
});

test('getStackSyncStatus returns object with source stack', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    const status = sync.getStackSyncStatus();
    return { success: status && status.source === 'stack' };
});

test('getStackPrivacy returns object with source stack', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync'));
    const privacy = sync.getStackPrivacy();
    return { success: privacy && privacy.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);