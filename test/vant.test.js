#!/usr/bin/env node
/**
 * Vant Module Unit Tests (v0.8.6)
 * Tests for vant.js (framework absorbed into vant)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log('  PASS: ' + name);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log('  FAIL: ' + name + ' - ' + (result.error || 'assertion failed'));
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log('  FAIL: ' + name + ' - ' + e.message);
    }
}

console.log('\nVANT MODULE TESTS (v0.8.6)\n');

const vant = require(path.join(ROOT, 'lib', 'vant'));

// Core tests
test('vant module loads', () => ({ success: !!vant }));
test('vant has init function', () => ({ success: typeof vant.init === 'function' }));
test('vant has think function', () => ({ success: typeof vant.think === 'function' }));
test('vant has act function', () => ({ success: typeof vant.act === 'function' }));
test('vant has getState function', () => ({ success: typeof vant.getState === 'function' }));
test('vant has getStatus function', () => ({ success: typeof vant.getStatus === 'function' }));
test('vant has isOperationAllowed', () => ({ success: typeof vant.isOperationAllowed === 'function' }));
test('vant has brain getter', () => ({ success: !!vant.brain }));
test('vant has search getter', () => ({ success: !!vant.search }));
test('vant has pipeline getter', () => ({ success: !!vant.pipeline }));

// Framework absorbed from framework.js
test('vant has computeEval', () => ({ success: typeof vant.computeEval === 'function' }));
test('vant has embedText', () => ({ success: typeof vant.embedText === 'function' }));

// Brain has framework config functions (absorbed from framework.js)
const brain = vant.brain;
test('brain has getBrainFrameworkConfig', () => ({ success: typeof brain.getBrainFrameworkConfig === 'function' }));
test('brain has setBrainFrameworkConfig', () => ({ success: typeof brain.setBrainFrameworkConfig === 'function' }));
test('brain has getStackFrameworkConfigs', () => ({ success: typeof brain.getStackFrameworkConfigs === 'function' }));
test('getStackFrameworkConfigs returns object', () => ({ success: typeof brain.getStackFrameworkConfigs() === 'object' }));

console.log('\n--- RESULTS ---\n');
console.log('  Passed:  ' + results.passed);
console.log('  Failed:  ' + results.failed);
process.exit(results.failed > 0 ? 1 : 0);
