#!/usr/bin/env node
/**
 * VAF Module Unit Tests
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

console.log('\n🛡️  VAF MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('vaf module loads', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: !!vaf };
});

// Regression (audit vaf C1, 2026-09-22): _loadBlockedIPs() called audit.info()
// while vaf's own `audit` was a plain function — a valid .circuit-vaf.json
// crashed the ENTIRE vaf module at require time. Happy path (no blocklist
// file) masked it. A fresh child process gives us a clean module graph.
test('vaf loads with blocked-IPs file present (audit C1 regression)', () => {
    const fs = require('fs');
    const { execFileSync } = require('child_process');
    const blockedFile = path.join(ROOT, '.circuit-vaf.json');
    const planted = JSON.stringify({
        '203.0.113.9': { until: Date.now() + 60000, reason: 'vaf-test' }
    });
    const existed = fs.existsSync(blockedFile);
    if (!existed) fs.writeFileSync(blockedFile, planted, 'utf8');
    try {
        execFileSync(process.execPath, [
            '-e',
            'const vaf = require(process.argv[1]);' +
            'if (typeof vaf.check !== "function") throw new Error("vaf exports broken");',
            path.join(ROOT, 'lib', 'vaf.js')
        ], { cwd: ROOT, timeout: 15000 });
        return { success: true };
    } catch (e) {
        return { success: false, error: (e.message || 'require crashed').split('\n')[0] };
    } finally {
        if (!existed) { try { fs.unlinkSync(blockedFile); } catch (e) {} }
    }
});

test('vaf has validateString function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.validateString === 'function' };
});

test('vaf has check function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.check === 'function' };
});

test('vaf has sanitize function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.sanitize === 'function' };
});

test('vaf has middleware function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.middleware === 'function' };
});

test('vaf has getStatus function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.getStatus === 'function' };
});

test('vaf has isOperationAllowed function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.isOperationAllowed === 'function' };
});

// ============================================
// SUMMARY
// Multibrain tests
test('vaf has getBrainVafConfig function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.getBrainVafConfig === 'function' };
});

test('vaf has setBrainVafConfig function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.setBrainVafConfig === 'function' };
});

// Stack tests
test('vaf has getStackVafConfigs function', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: typeof vaf.getStackVafConfigs === 'function' };
});

test('getStackVafConfigs returns object with source stack', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    const result = vaf.getStackVafConfigs();
    return { success: result && result.source === 'stack' };
});

// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);