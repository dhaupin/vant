#!/usr/bin/env node
/**
 * Stego Module Unit Tests
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

console.log('\n�肀 TEGO MODULE TESTS\n');

test('stego module loads', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: !!stego };
});

test('stego has version', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.version === 'string' || typeof stego.version === 'number' };
});

test('stego has encode function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.encode === 'function' };
});

test('stego has decode function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.decode === 'function' };
});

test('stego has hasData function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.hasData === 'function' };
});

test('stego has encodeToBuffer function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.encodeToBuffer === 'function' };
});

test('stego has decodeFromBuffer function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.decodeFromBuffer === 'function' };
});

test('stego has generateManifest function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.generateManifest === 'function' };
});

test('stego has validateManifest function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.validateManifest === 'function' };
});

test('stego has getCapacity function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.getCapacity === 'function' };
});

test('stego has getLayerStatus function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.getLayerStatus === 'function' };
});

test('stego has isOperationAllowed function', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    return { success: typeof stego.isOperationAllowed === 'function' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);