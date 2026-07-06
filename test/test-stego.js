#!/usr/bin/env node
/**
 * Stego Module Unit Tests - CRITICAL
 * Tests for steganography (encoding/decoding brain data)
 *
 * Run: node test/test-stego.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const stego = require('../lib/stego');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

console.log('\n=== Stego Module Tests (CRITICAL) ===\n');

// Test 1: Core exports - encoding/decoding
test('has version property', () => {
    return typeof stego.version === 'string';
});

test('has encode function', () => {
    return typeof stego.encode === 'function';
});

test('has decode function', () => {
    return typeof stego.decode === 'function';
});

test('has hasData function', () => {
    return typeof stego.hasData === 'function';
});

test('has encodeToBuffer function', () => {
    return typeof stego.encodeToBuffer === 'function';
});

test('has decodeFromBuffer function', () => {
    return typeof stego.decodeFromBuffer === 'function';
});

test('has encodeSvg function', () => {
    return typeof stego.encodeSvg === 'function';
});

test('has decodeSvg function', () => {
    return typeof stego.decodeSvg === 'function';
});

test('has generateManifest function', () => {
    return typeof stego.generateManifest === 'function';
});

test('has validateManifest function', () => {
    return typeof stego.validateManifest === 'function';
});

test('has getCapacity function', () => {
    return typeof stego.getCapacity === 'function';
});

// Test 2: Version is string
test('version is string', () => {
    return typeof stego.version === 'string';
});

// Test 3: hasData detection
test('hasData returns boolean', () => {
    // hasData checks for BRN: prefix
    const buffer = Buffer.from('BRN:{"test":"data"}');
    return typeof stego.hasData(buffer) === 'boolean';
});

// Test 4: Manifest validation (type must be 'bootstrap')
test('validateManifest checks bootstrap type', () => {
    const manifest = { version: '1.0', type: 'bootstrap' };
    const result = stego.validateManifest(manifest);
    return result.valid === true;
});

// Test 5: Manifest rejects non-bootstrap
test('validateManifest rejects invalid type', () => {
    const manifest = { version: '1.0', type: 'brain' };
    const result = stego.validateManifest(manifest);
    return result.valid === false;
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
}

console.log('All stego tests passed! 🛡️\n');
