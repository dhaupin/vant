#!/usr/bin/env node
/**
 * Consensus Module Unit Tests
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

console.log('\n💨 CONSENSUS MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('consensus module loads', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: !!consensus };
});

// ============================================
// EXPORTS
// ============================================

test('consensus has vote function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.vote === 'function' };
});

test('consensus has tally function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.tally === 'function' };
});

test('consensus has getLayerStatus function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.getLayerStatus === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('consensus has getBrainConsensusConfig function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.getBrainConsensusConfig === 'function' };
});

test('consensus has setBrainConsensusConfig function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.setBrainConsensusConfig === 'function' };
});

// Stack tests
test('consensus has getStackConsensusConfigs function', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    return { success: typeof consensus.getStackConsensusConfigs === 'function' };
});

test('getStackConsensusConfigs returns object with source stack', () => {
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    const result = consensus.getStackConsensusConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);
