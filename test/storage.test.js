#!/usr/bin/env node
/**
 * Storage Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
const _asyncTests = [];

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

async function asyncTest(name, fn) {
    _asyncTests.push({ name, fn });
}

async function _runAsyncTests() {
    for (const { name, fn } of _asyncTests) {
        try {
            const result = await fn();
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
}

console.log('\n💾 STORAGE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('storage module loads', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage };
});

test('storage has get function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.get === 'function' };
});

test('storage has FileStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.FileStorage };
});

test('storage has BrainStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.BrainStorage };
});

test('storage has VectorStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.VectorStorage };
});

test('storage has ConfigStorage', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: !!Storage.ConfigStorage };
});

test('storage has version', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.version === 'string' };
});

test('storage has getLayerStatus', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getLayerStatus === 'function' };
});

test('storage has isOperationAllowed', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.isOperationAllowed === 'function' };
});

test('storage has getStatus', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getStatus === 'function' };
});

// ============================================
// GET
// ============================================

test('storage.get works for brain type', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const brain = Storage.get('brain');
    return { success: !!brain || brain === null };
});

test('storage.get works for vector type', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const vector = Storage.get('vector');
    return { success: !!vector || vector === null };
});

// ============================================
// STATUS
// ============================================

test('getStatus returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const status = Storage.getStatus();
    return { success: typeof status === 'object' };
});

test('getLayerStatus returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const status = Storage.getLayerStatus();
    return { success: typeof status === 'object' };
});

// ============================================
// PERMISSIONS
// ============================================

test('isOperationAllowed returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const result = Storage.isOperationAllowed('read');
    return { success: typeof result === 'object' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('storage has listStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.listStack === 'function' };
});

test('storage has readStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.readStack === 'function' };
});

test('storage has existsStack function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.existsStack === 'function' };
});

test('storage has getStackStats function', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    return { success: typeof Storage.getStackStats === 'function' };
});

test('listStack returns array', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const files = Storage.listStack();
    return { success: Array.isArray(files) };
});

test('existsStack returns object', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const result = Storage.existsStack('nonexistent');
    return { success: typeof result === 'object' };
});

test('getStackStats returns object with source stack', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const stats = Storage.getStackStats();
    return { success: stats && stats.source === 'stack' };
});

// ============================================
// v0.9.0-axolotl PIPELINE-BACKED VARIANTS
// ============================================
asyncTest('storage: readSecured returns content for existing file', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const s = Storage.get('file', { basePath: path.join(ROOT, 'models', 'public', 'vant') });
    const content = await s.readSecured('identity.md');
    return { success: typeof content === 'string' && content.length > 0 };
});

asyncTest('storage: readSecured returns null for missing file', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const s = Storage.get('file', { basePath: path.join(ROOT, 'models', 'public', 'vant') });
    const content = await s.readSecured('does-not-exist-' + Date.now() + '.md');
    return { success: content === null };
});

asyncTest('storage: writeSecured writes and readSecured reads back', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const tmpBase = path.join(ROOT, 'models', 'private', 'vant', '.test-tmp');
    require('fs').mkdirSync(tmpBase, { recursive: true });
    const s = Storage.get('file', { basePath: tmpBase });
    const f = 'pipeline-test-' + Date.now() + '.md';
    try {
        const wrote = await s.writeSecured(f, 'hello pipeline');
        if (!wrote) return { success: false, error: 'writeSecured returned falsy' };
        const back = await s.readSecured(f);
        return { success: back === 'hello pipeline' };
    } finally {
        try { s.deleteSecured(f); } catch (e) {}
        try { require('fs').rmdirSync(tmpBase); } catch (e) {}
    }
});

asyncTest('storage: deleteSecured removes a file', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const tmpBase = path.join(ROOT, 'models', 'private', 'vant', '.test-tmp');
    require('fs').mkdirSync(tmpBase, { recursive: true });
    const s = Storage.get('file', { basePath: tmpBase });
    const f = 'pipeline-delete-' + Date.now() + '.md';
    try {
        await s.writeSecured(f, 'tmp');
        const removed = await s.deleteSecured(f);
        const still = await s.readSecured(f);
        return { success: removed === true && still === null };
    } finally {
        try { s.delete(f); } catch (e) {}
        try { require('fs').rmdirSync(tmpBase); } catch (e) {}
    }
});

asyncTest('storage: listSecured returns array', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const s = Storage.get('file', { basePath: path.join(ROOT, 'models', 'public', 'vant') });
    const result = await s.listSecured('*.md');
    return { success: Array.isArray(result) };
});

asyncTest('storage: Secured variants throw on path traversal', async () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const s = Storage.get('file', { basePath: path.join(ROOT, 'models', 'public', 'vant') });
    let blocked = false;
    try {
        await s.readSecured('../../../etc/passwd');
    } catch (e) {
        blocked = e.message.includes('blocked') || e.message.includes('Path');
    }
    return { success: blocked, error: blocked ? null : 'expected path-traversal block' };
});

// ============================================
// SUMMARY
// ============================================

async function _printResults() {
    await _runAsyncTests();
    
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

    process.exit(results.failed > 0 ? 1 : 0);
}

_printResults();