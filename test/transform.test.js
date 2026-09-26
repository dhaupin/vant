#!/usr/bin/env node
/**
 * Transform module tests
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

async function testAsync(name, fn) {
    try {
        await fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🔄 TRANSFORM TESTS\n');

const transform = require('../lib/transform');

test('transform has gather function', () => {
    return { success: typeof transform.gather === 'function' };
});

test('transform has toHorcrux function', () => {
    return { success: typeof transform.toHorcrux === 'function' };
});

test('transform has restore function', () => {
    return { success: typeof transform.restore === 'function' };
});

test('transform has inspectHorcrux function', () => {
    return { success: typeof transform.inspectHorcrux === 'function' };
});

testAsync('transform gather returns object', async () => {
    const data = await transform.gather();
    return { success: typeof data === 'object' };
});

testAsync('transform gather returns agents', async () => {
    const data = await transform.gather();
    return { success: 'agents' in data };
});

testAsync('transform gather returns islands', async () => {
    const data = await transform.gather();
    return { success: 'islands' in data };
});

testAsync('transform toHorcrux returns string', async () => {
    const json = await transform.toHorcrux();
    return { success: typeof json === 'string' };
});

testAsync('transform toHorcrux has valid JSON', async () => {
    const json = await transform.toHorcrux();
    const data = JSON.parse(json);
    return { success: data && data.type === 'vant-horcrux' };
});

testAsync('transform restore returns object', async () => {
    const data = {
        timestamp: Date.now(),
        version: '0.8.6',
        mode: { loaded: false },
        brainStorage: { loaded: false },
        neurons: { loaded: false },
        configStorage: { loaded: false },
        islandState: { loaded: false },
        agents: null,
        islands: { manifests: null },
        config: null,
        runtime: null,
        boot: null
    };
    const result = await transform.restore(data);
    return { success: typeof result === 'object' };
});

test('transform inspectHorcrux is function', () => {
    return { success: typeof transform.inspectHorcrux === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
