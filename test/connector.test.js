#!/usr/bin/env node
/**
 * Connector Module Unit Tests
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

console.log('\n🔗 CONNECTOR MODULE TESTS\n');

test('connector module loads', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: !!connector };
});

test('connector has getConnector function', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: typeof connector.getConnector === 'function' };
});

test('connector has VectorConnector class', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: !!connector.VectorConnector };
});

test('connector has PineconeConnector class', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: !!connector.PineconeConnector };
});

// Multibrain tests
test('connector has getBrainConnectorConfig function', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: typeof connector.getBrainConnectorConfig === 'function' };
});

test('connector has setBrainConnectorConfig function', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: typeof connector.setBrainConnectorConfig === 'function' };
});

// Stack tests
test('connector has getStackConnectorConfigs function', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    return { success: typeof connector.getStackConnectorConfigs === 'function' };
});

test('getStackConnectorConfigs returns object with source stack', () => {
    const connector = require(path.join(ROOT, 'lib', 'connector'));
    const result = connector.getStackConnectorConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);