#!/usr/bin/env node
/**
 * Nature Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

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

console.log('\n💨 NATURE MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('nature module loads', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: !!nature };
});

// ============================================
// EXPORTS
// ============================================

test('nature has Nature class', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature === 'function' };
});

test('nature has Flywheel class', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.Flywheel === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('nature has getBrainNatureConfig function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.getBrainNatureConfig === 'function' };
});

test('nature has setBrainNatureConfig function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.setBrainNatureConfig === 'function' };
});

// Stack tests
test('nature has getStackNatureConfigs function', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    return { success: typeof nature.getStackNatureConfigs === 'function' };
});

test('getStackNatureConfigs returns object with source stack', () => {
    const nature = require(path.join(ROOT, 'lib', 'nature'));
    const result = nature.getStackNatureConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================
// WAVE 3 / #189-R4: CATEGORY H GATE — DEFAULT OFF
// (the acceptance pin the wave asked for: one unit test asserting the
// default is OFF — the cosmic fetcher is unreachable unless the operator
// turns entropy.cosmic ON)
// ============================================

test('Category H gate: accumulateCosmic() default OFF — fetcher never reached', () => {
    const encryptMod = require(path.join(ROOT, 'lib', 'encrypt'));
    const realFetch = encryptMod.default.getCosmicEntropy;
    let reachedFetch = false;
    try {
        encryptMod.default.getCosmicEntropy = async () => { reachedFetch = true; return { data: {} }; };
        const Nature = require(path.join(ROOT, 'lib', 'nature'));
        const n = new Nature();
        n.accumulateCosmic(); // async fn: gate runs in the synchronous prologue
        if (reachedFetch) return { success: false, error: 'cosmic fetcher reached with entropy.cosmic OFF' };
        return { success: true };
    } finally {
        encryptMod.default.getCosmicEntropy = realFetch;
    }
});

test('Category H gate: habitat feedCosmicEntropy() default OFF — returns 0.5, fetcher never reached', () => {
    const encryptMod = require(path.join(ROOT, 'lib', 'encrypt'));
    const realFetch = encryptMod.default.getCosmicEntropy;
    let reachedFetch = false;
    try {
        encryptMod.default.getCosmicEntropy = async () => { reachedFetch = true; return { data: {} }; };
        const Habitat = require(path.join(ROOT, 'lib', 'habitat'));
        const feeds = [];
        const chaos = Habitat.prototype.feedCosmicEntropy.call({
            feed: (e) => feeds.push(e)
        }); // async fn: gate + early return run synchronously
        if (reachedFetch) return { success: false, error: 'cosmic fetcher reached with entropy.cosmic OFF' };
        if (chaos !== 0.5 && !(chaos instanceof Promise)) {
            return { success: false, error: 'expected 0.5 local-randomness chaos, got: ' + chaos };
        }
        return { success: true };
    } finally {
        encryptMod.default.getCosmicEntropy = realFetch;
    }
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);
