#!/usr/bin/env node
/**
 * Agents, Runop, Vibe Module Tests
 */

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    try {
        if (fn()) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}`); }
    } catch (e) { results.failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== Agents Module Tests ===\n');
const agents = require('../lib/agents');
test('has spawn function', () => typeof agents.spawn === 'function');
test('has delegate function', () => typeof agents.delegate === 'function');
test('has delegateAsync function', () => typeof agents.delegateAsync === 'function');
test('has pollWork function', () => typeof agents.pollWork === 'function');
test('has completeWork function', () => typeof agents.completeWork === 'function');
test('has approve function', () => typeof agents.approve === 'function');
test('has reject function', () => typeof agents.reject === 'function');
test('has list function', () => typeof agents.list === 'function');
test('has get function', () => typeof agents.get === 'function');
test('has terminate function', () => typeof agents.terminate === 'function');
test('has Agents class', () => typeof agents.Agents === 'function');
// v0.9.0-axolotl T15e: agents.MAX_AGENTS constant removed. The
// agent cap is config-driven (cfg.get('agents.maxAgents', 200)) and is
// not a hard-coded constant. There is no "MAX_AGENTS" export.
// Re-add only if a real static cap is introduced.

console.log('\n=== Runop Module Tests ===\n');
const runop = require('../lib/runop');
test('has init function', () => typeof runop.init === 'function');
test('has run function', () => typeof runop.run === 'function');
test('has stop function', () => typeof runop.stop === 'function');
test('has getStatus function', () => typeof runop.getStatus === 'function');

console.log('\n=== Vibe Module Tests ===\n');
const vibe = require('../lib/vibe');
test('has getMood function', () => typeof vibe.getMood === 'function');
test('has setMood function', () => typeof vibe.setMood === 'function');
test('has getVibeConfig function', () => typeof vibe.getVibeConfig === 'function');
test('has onTaskSuccess function', () => typeof vibe.onTaskSuccess === 'function');
test('has onTaskError function', () => typeof vibe.onTaskError === 'function');
test('has getCommitVibe function', () => typeof vibe.getCommitVibe === 'function');
test('has isCautious function', () => typeof vibe.isCautious === 'function');
test('has isCreative function', () => typeof vibe.isCreative === 'function');

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
if (results.failed > 0) process.exit(1);
console.log('All module tests passed!\n');
