#!/usr/bin/env node
/**
 * Trust Module Unit Tests (v0.9.0)
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

console.log('\n🔐 TRUST MODULE TESTS (v0.9.0)\n');

test('trust module loads', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: !!trust };
});

test('trust has getScore function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.getScore === 'function' };
});

test('trust has record function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.record === 'function' };
});

test('trust has can function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.can === 'function' };
});

test('trust has leaderboard function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.leaderboard === 'function' };
});

test('trust has export function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.export === 'function' };
});

test('trust has import function', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    return { success: typeof trust.import === 'function' };
});

// Functional tests
console.log('\n--- Functional Tests ---\n');

test('getScore returns default for unknown entity', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const score = trust.getScore('unknown-agent-123');
    return { success: score >= 0 && score <= 1 };
});

test('record positive interaction increases score', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const before = trust.getScore('test-agent-positive');
    trust.record('test-agent-positive', 'help', { positive: true, value: 0.1 });
    const after = trust.getScore('test-agent-positive');
    return { success: after > before };
});

test('record negative interaction decreases score', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const before = trust.getScore('test-agent-negative');
    trust.record('test-agent-negative', 'harm', { positive: false, value: 0.1 });
    const after = trust.getScore('test-agent-negative');
    return { success: after < before };
});

test('record with note stores note in history', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.record('test-agent-note', 'help', { positive: true, note: 'Test note' });
    const history = trust.getHistory('test-agent-note');
    return { success: history.length > 0 && history[0].note === 'Test note' };
});

test('getKarma returns numeric value', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.record('test-agent-karma', 'help', { positive: true });
    const karma = trust.getKarma('test-agent-karma');
    return { success: typeof karma === 'number' };
});

test('setRequired and can work together', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.setRequired('test_action', 0.7);
    trust.record('test-agent-perm', 'help', { positive: true, value: 0.8 });
    const allowed = trust.can('test-agent-perm', 'test_action');
    return { success: allowed === true };
});

test('leaderboard returns array', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const board = trust.leaderboard(5);
    return { success: Array.isArray(board) };
});

test('getChain returns score, karma, and history', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.record('test-agent-chain', 'help', { positive: true });
    const chain = trust.getChain('test-agent-chain');
    return { success: 
        typeof chain.score === 'number' && 
        typeof chain.karma === 'number' && 
        Array.isArray(chain.history) 
    };
});

test('export returns scores, karma, and roleTrust', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.record('test-agent-export', 'help', { positive: true });
    const exported = trust.export();
    return { success: 
        exported.scores && 
        exported.karma && 
        exported.roleTrust 
    };
});

test('import restores trust data', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const testData = {
        scores: { 'import-test': 0.9 },
        karma: { 'import-test': 10 },
        roleTrust: { 'test_action': 0.5 }
    };
    trust.import(testData);
    const score = trust.getScore('import-test');
    return { success: score === 0.9 };
});

test('reset clears trust for entity', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    trust.record('test-agent-reset', 'help', { positive: true });
    trust.reset('test-agent-reset');
    const score = trust.getScore('test-agent-reset');
    return { success: score === 0.5 }; // Back to default
});

// Print summary
console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
console.log('='.repeat(50));

process.exit(results.failed > 0 ? 1 : 0);
