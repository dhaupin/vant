#!/usr/bin/env node
/**
 * Agents Module Unit Tests
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

console.log('\n👥 AGENTS MODULE TESTS\n');

test('agents module loads', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: !!agents };
});

test('agents has Agents class', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: !!agents.Agents };
});

test('agents has spawn function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.spawn === 'function' };
});

test('agents has delegate function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.delegate === 'function' };
});

test('agents has delegateAsync function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.delegateAsync === 'function' };
});

test('agents has pollWork function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.pollWork === 'function' };
});

test('agents has fork function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.fork === 'function' };
});

test('agents has join function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.join === 'function' };
});

test('agents has list function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.list === 'function' };
});

test('agents has get function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.get === 'function' };
});

test('agents has terminate function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.terminate === 'function' };
});

test('agents has getStatus function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.getStatus === 'function' };
});

test('agents has isOperationAllowed function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.isOperationAllowed === 'function' };
});

// Multibrain tests
test('agents has getBrainAgentsConfig function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.getBrainAgentsConfig === 'function' };
});

test('agents has setBrainAgentsConfig function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.setBrainAgentsConfig === 'function' };
});

// Stack tests
test('agents has getStackAgentsConfigs function', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    return { success: typeof agents.getStackAgentsConfigs === 'function' };
});

test('getStackAgentsConfigs returns object with source stack', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents'));
    const result = agents.getStackAgentsConfigs();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);