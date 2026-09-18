#!/usr/bin/env node
/**
 * Cloudflare Adapter Tests (v0.9.0)
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

console.log('\n☁️ CLOUDFLARE ADAPTER TESTS\n');

const cloudflare = require('../lib/adapters/cloudflare');

test('cloudflare exports version', () => {
    return { success: typeof cloudflare.version === 'string' };
});

test('cloudflare has setTransport function', () => {
    return { success: typeof cloudflare.setTransport === 'function' };
});

test('cloudflare has getTransport function', () => {
    return { success: typeof cloudflare.getTransport === 'function' };
});

test('cloudflare has sync function', () => {
    return { success: typeof cloudflare.sync === 'function' };
});

test('cloudflare has kv function', () => {
    return { success: typeof cloudflare.kv === 'function' };
});

test('cloudflare has r2 function', () => {
    return { success: typeof cloudflare.r2 === 'function' };
});

test('cloudflare has workers function', () => {
    return { success: typeof cloudflare.workers === 'function' };
});

test('cloudflare has getStatus function', () => {
    return { success: typeof cloudflare.getStatus === 'function' };
});

test('cloudflare has getLayerStatus function', () => {
    return { success: typeof cloudflare.getLayerStatus === 'function' };
});

test('cloudflare sync returns handshake/push/pull', () => {
    const sync = cloudflare.sync();
    return { success: typeof sync.handshake === 'function' && typeof sync.push === 'function' && typeof sync.pull === 'function' };
});

test('cloudflare kv returns get/put/delete', () => {
    const kv = cloudflare.kv();
    return { success: typeof kv.get === 'function' && typeof kv.put === 'function' && typeof kv.delete === 'function' };
});

test('cloudflare r2 returns get/put/list', () => {
    const r2 = cloudflare.r2();
    return { success: typeof r2.get === 'function' && typeof r2.put === 'function' && typeof r2.list === 'function' };
});

test('cloudflare workers returns call', () => {
    const workers = cloudflare.workers();
    return { success: typeof workers.call === 'function' };
});

test('cloudflare getStatus returns object', () => {
    const status = cloudflare.getStatus();
    return { success: typeof status === 'object' };
});

test('cloudflare getLayerStatus returns adapter type', () => {
    const status = cloudflare.getLayerStatus();
    return { success: status && status.type === 'adapter' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
