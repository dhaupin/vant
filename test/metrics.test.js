#!/usr/bin/env node
/**
 * Metrics Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n💨 METRICS MODULE TESTS\n');

test('metrics module loads', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    return { success: !!m };
});

test('metrics has increment function', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    return { success: typeof m.increment === 'function' };
});

test('metrics has getBrainMetricsConfig function', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    return { success: typeof m.getBrainMetricsConfig === 'function' };
});

test('metrics has setBrainMetricsConfig function', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    return { success: typeof m.setBrainMetricsConfig === 'function' };
});

test('metrics has getStackMetricsConfigs function', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    return { success: typeof m.getStackMetricsConfigs === 'function' };
});

test('getStackMetricsConfigs returns object with source stack', () => {
    const m = require(path.join(ROOT, 'lib', 'metrics'));
    const result = m.getStackMetricsConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
