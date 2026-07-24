#!/usr/bin/env node
/**
 * Boot Module Unit Tests
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

console.log('\n🚀 BOOT MODULE TESTS\n');

test('boot module loads', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: !!boot };
});

test('boot has boot function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.boot === 'function' };
});

test('boot has hydrate function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.hydrate === 'function' };
});

test('boot has getAvailable function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.getAvailable === 'function' };
});

test('boot has getHydrated function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.getHydrated === 'function' };
});

test('boot has getManifest function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.getManifest === 'function' };
});

test('boot has main function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.main === 'function' };
});

// Multibrain tests
test('boot has getBrainBootConfig function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.getBrainBootConfig === 'function' };
});

test('boot has setBrainBootConfig function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.setBrainBootConfig === 'function' };
});

// Stack tests
test('boot has getStackBootConfigs function', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    return { success: typeof boot.getStackBootConfigs === 'function' };
});

test('getStackBootConfigs returns object with source stack', () => {
    const boot = require(path.join(ROOT, 'lib', 'boot'));
    const result = boot.getStackBootConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);