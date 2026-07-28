#!/usr/bin/env node
/**
 * Missing Modules Tests - format, node-registry, registry, rls, secret
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n📦 MISSING MODULES TESTS\n');

// ============================================
// FORMAT MODULE
// ============================================

test('format module loads', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: !!format };
});

test('format has detect function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.detect === 'function' };
});

test('format has parse function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.parse === 'function' };
});

test('format has serialize function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.serialize === 'function' };
});

test('format has loadFile function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.loadFile === 'function' };
});

test('format has saveFile function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.saveFile === 'function' };
});

test('format has listFiles function', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: typeof format.listFiles === 'function' };
});

test('format detect returns object for json', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.detect('{"key":"value"}');
    return { success: result && typeof result.format === 'string' };
});

test('format detect returns object with confidence', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.detect('key: value');
    return { success: result && typeof result.confidence === 'number' };
});

test('format detect returns object for markdown', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    const result = format.detect('# Hello\n\nWorld');
    return { success: result && typeof result.format === 'string' };
});

test('format has DEFAULT_EXTENSIONS', () => {
    const format = require(path.join(ROOT, 'lib', 'format'));
    return { success: Array.isArray(format.DEFAULT_EXTENSIONS) };
});

// ============================================
// NODE-REGISTRY MODULE
// ============================================

test('node-registry module loads', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: !!nodeReg };
});

test('node-registry has register function', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: typeof nodeReg.register === 'function' };
});

test('node-registry has discover function', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: typeof nodeReg.discover === 'function' };
});

test('node-registry has get function', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: typeof nodeReg.get === 'function' };
});

test('node-registry has list function', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: typeof nodeReg.list === 'function' };
});

test('node-registry has getStats function', () => {
    const nodeReg = require(path.join(ROOT, 'lib', 'node-registry'));
    return { success: typeof nodeReg.getStats === 'function' };
});

// ============================================
// REGISTRY MODULE
// ============================================

test('registry module loads', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: !!reg };
});

test('registry has Registry class', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.Registry === 'function' };
});

test('registry has register function', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.register === 'function' };
});

test('registry has list function', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.list === 'function' };
});

test('registry has get function', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.get === 'function' };
});

test('registry has findByType function', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.findByType === 'function' };
});

test('registry has count function', () => {
    const reg = require(path.join(ROOT, 'lib', 'registry'));
    return { success: typeof reg.count === 'function' };
});

// ============================================
// RLS MODULE
// ============================================

test('rls module loads', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: !!rls };
});

test('rls has init function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.init === 'function' };
});

test('rls has checkRead function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.checkRead === 'function' };
});

test('rls has checkWrite function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.checkWrite === 'function' };
});

test('rls has getHabitat function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.getHabitat === 'function' };
});

test('rls has setWorkspace function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.setWorkspace === 'function' };
});

test('rls has middleware function', () => {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    return { success: typeof rls.middleware === 'function' };
});

// ============================================
// SECRET MODULE
// ============================================

test('secret module loads', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: !!secret };
});

test('secret has get function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.get === 'function' };
});

test('secret has set function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.set === 'function' };
});

test('secret has has function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.has === 'function' };
});

test('secret has clear function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.clear === 'function' };
});

test('secret has clearAll function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.clearAll === 'function' };
});

test('secret has types function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.types === 'function' };
});

test('secret hasPassword function exists', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.hasPassword === 'function' };
});

test('secret has info function', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    return { success: typeof secret.info === 'function' };
});

test('secret info returns info for valid type', () => {
    const secret = require(path.join(ROOT, 'lib', 'secret'));
    const result = secret.info('brain');
    return { success: result && typeof result.type === 'string' };
});

// ============================================
// RESULTS
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
