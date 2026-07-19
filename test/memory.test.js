#!/usr/bin/env node
/**
 * Memory Module Unit Tests
 * Tests for unified memory API (state, learn, address, locate)
 */

const path = require('path');

const results = { passed: 0, failed: 0, tests: [] };
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

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

console.log('\n=== Memory Tests ===\n');

test('memory loads', () => {
    const m = require('../lib/memory');
    assert(m && typeof m.state === 'function');
    return true;
});

test('getStats works', () => {
    const m = require('../lib/memory');
    const stats = m.getStats();
    assert(stats && typeof stats.state === 'number');
    return true;
});

asyncTest('state stores value', async () => {
    const m = require('../lib/memory');
    const r = await m.state('test-key', 'test-value', { ttl: 60000 });
    assert(r && r.success === true);
    return true;
});

asyncTest('recall retrieves value', async () => {
    const m = require('../lib/memory');
    await m.state('test-recall', 'test-val-123', { ttl: 60000 });
    const v = await m.recall('test-recall');
    assert(v === 'test-val-123');
    return true;
});

asyncTest('learn stores document', async () => {
    const m = require('../lib/memory');
    const r = await m.learn('test-doc', '# Doc', { ttl: 60000 });
    assert(r && r.success === true);
    return true;
});

asyncTest('query retrieves document', async () => {
    const m = require('../lib/memory');
    await m.learn('test-q-doc', '# Query Doc', { ttl: 60000 });
    const c = await m.query('test-q-doc');
    assert(c && c.includes('Query Doc'));
    return true;
});

asyncTest('address generates barcode', async () => {
    const m = require('../lib/memory');
    const b = await m.address({ test: 'data' });
    assert(b && typeof b === 'string' && b.length > 0);
    return true;
});

asyncTest('locate retrieves data', async () => {
    const m = require('../lib/memory');
    const b = await m.address({ test: 'locate-data', nested: { v: 123 } });
    const r = await m.locate(b);
    assert(r && r.data && r.data.test === 'locate-data');
    return true;
});

asyncTest('api.memoryState works', async () => {
    const api = require('../lib/api');
    const r = await api.memoryState('api-key', 'api-val');
    assert(r && r.success === true);
    return true;
});

asyncTest('api.memoryRecall works', async () => {
    const api = require('../lib/api');
    await api.memoryState('api-recall', 'api-recall-val');
    const v = await api.memoryRecall('api-recall');
    assert(v === 'api-recall-val');
    return true;
});

(async () => {
    await _runAsyncTests();
    console.log(`\nResults: ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
