/**
 * Lineage Module Tests
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

let results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result && result.success) {
            console.log(`✓ ${name}`);
            results.passed++;
        } else {
            console.log(`✗ ${name}: ${result?.error || 'failed'}`);
            results.failed++;
        }
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        results.failed++;
    }
}

console.log('\n🔬 LINEAGE MODULE TESTS\n');

// Basic tests
test('lineage module loads', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: !!lineage };
});

test('lineage has record function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.record === 'function' };
});

test('lineage has trace function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.trace === 'function' };
});

test('lineage has children function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.children === 'function' };
});

test('lineage has getStats function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.getStats === 'function' };
});

test('record creates lineage entry', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    const id = 'test-lineage-' + Date.now();
    lineage.record(id, { source: 'test', type: 'test' });
    const result = lineage.trace(id);
    return { success: result && (result.entry || result.length > 0) };
});

test('trace returns array or null', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    const entries = lineage.trace('nonexistent');
    return { success: Array.isArray(entries) || entries === null };
});

test('children returns array', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    const kids = lineage.children('nonexistent');
    return { success: Array.isArray(kids) };
});

test('getStats returns object', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    const stats = lineage.getStats();
    return { success: typeof stats === 'object' };
});

// Stack tests
test('lineage has getStackLineageStats function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.getStackLineageStats === 'function' };
});

test('lineage has stackTrace function', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    return { success: typeof lineage.stackTrace === 'function' };
});

test('getStackLineageStats returns object with source stack', () => {
    const lineage = require(path.join(ROOT, 'lib', 'lineage'));
    const stats = lineage.getStackLineageStats();
    return { success: stats && stats.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
