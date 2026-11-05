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

console.log('\n🔍 STEGO MODULE TESTS\n');

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

// (wave 14) the bootstrap channel's first native grade (was typeof-only
// in the coverage smoke battery): manifest -> sealed envelope -> virgin
// manifest round trip, the plaintext lane, and the wrong-key refusal.
test('stego bootstrap round trip with a password', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    const manifest = stego.generateManifest({ type: 'bootstrap', brain: 'vant' });
    const sealed = stego.createBootstrap(manifest, 'wave14-passphrase');
    const opened = stego.parseBootstrap(sealed, 'wave14-passphrase');
    return { success: sealed && opened.brain === 'vant' && opened.version === '1.0', opened };
});

test('stego bootstrap plaintext lane round trips unencrypted', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    const manifest = stego.generateManifest({ type: 'bootstrap' });
    const raw = stego.createBootstrap(manifest); // no password => plain JSON
    return { success: stego.parseBootstrap(raw).type === 'bootstrap' && typeof raw === 'string' && raw.length > 0 };
});

test('a wrong key refuses to open the bootstrap envelope', () => {
    const stego = require(path.join(ROOT, 'lib', 'stego'));
    const sealed = stego.createBootstrap({ type: 'bootstrap', created: 1 }, 'good-key');
    let threw = false;
    try { stego.parseBootstrap(sealed, 'wrong-key'); } catch (_e) { threw = true; }
    return { success: threw };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);