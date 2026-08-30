#!/usr/bin/env node
/**
 * Pipeline Module Unit Tests (v0.8.6)
 * Tests for pipeline.js (runop absorbed into pipeline)
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

console.log('\nPIPELINE MODULE TESTS (v0.8.6)\n');

const pipeline = require(path.join(ROOT, 'lib', 'pipeline'));
const brain = require(path.join(ROOT, 'lib', 'brain'));

// Core tests
test('pipeline module loads', () => ({ success: !!pipeline }));
test('pipeline has run function', () => ({ success: typeof pipeline.run === 'function' }));
test('pipeline has initLayers function', () => ({ success: typeof pipeline.initLayers === 'function' }));
test('pipeline has stop function', () => ({ success: typeof pipeline.stop === 'function' }));
test('pipeline has getStatus function', () => ({ success: typeof pipeline.getStatus === 'function' }));
test('pipeline has start function', () => ({ success: typeof pipeline.start === 'function' }));

// Brain integration
test('brain.currentBrain returns string', () => ({ success: typeof brain.currentBrain() === 'string' }));
test('brain.getStack returns array', () => ({ success: Array.isArray(brain.getStack()) }));
test('brain.getBrainPath returns string', () => ({ success: typeof brain.getBrainPath() === 'string' }));

console.log('\n--- RESULTS ---\n');
console.log('  Passed:  ' + results.passed);
console.log('  Failed:  ' + results.failed);
process.exit(results.failed > 0 ? 1 : 0);
