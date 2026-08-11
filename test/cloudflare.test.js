#!/usr/bin/env node
/**
 * Cloudflare Connector Tests (v0.9.0)
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

console.log('\n☁️ CLOUDFLARE CONNECTOR TESTS\n');

const cloudflare = require('../lib/connectors/cloudflare');

test('cloudflare exports version', () => {
    return { success: typeof cloudflare.version === 'string' };
});

test('cloudflare has configure function', () => {
    return { success: typeof cloudflare.configure === 'function' };
});

test('cloudflare has getConfig function', () => {
    return { success: typeof cloudflare.getConfig === 'function' };
});

test('cloudflare has getLayerStatus function', () => {
    return { success: typeof cloudflare.getLayerStatus === 'function' };
});

test('cloudflare has isOperationAllowed function', () => {
    return { success: typeof cloudflare.isOperationAllowed === 'function' };
});

test('cloudflare has getStatus function', () => {
    return { success: typeof cloudflare.getStatus === 'function' };
});

test('cloudflare getConfig returns object', () => {
    const config = cloudflare.getConfig();
    return { success: typeof config === 'object' };
});

test('cloudflare getLayerStatus returns connector type', () => {
    const status = cloudflare.getLayerStatus();
    return { success: status && status.type === 'connector' };
});

test('cloudflare getStatus returns connected boolean', () => {
    const status = cloudflare.getStatus();
    return { success: typeof status.connected === 'boolean' };
});

test('cloudflare isOperationAllowed returns object', () => {
    const result = cloudflare.isOperationAllowed('push');
    return { success: typeof result === 'object' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
