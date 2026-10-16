#!/usr/bin/env node
/**
 * Governance Module Unit Tests
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

console.log('\n💨 GOVERNANCE MODULE TESTS\n');

test('governance module loads', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: !!g };
});

test('governance has Governance class', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.Governance === 'function' };
});

test('governance has decide function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.decide === 'function' };
});

test('governance has getBrainGovernanceConfig function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.getBrainGovernanceConfig === 'function' };
});

test('governance has setBrainGovernanceConfig function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.setBrainGovernanceConfig === 'function' };
});

test('governance has getStackGovernanceConfigs function', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    return { success: typeof g.getStackGovernanceConfigs === 'function' };
});

test('getStackGovernanceConfigs returns object with source stack', () => {
    const g = require(path.join(ROOT, 'lib', 'governance'));
    const result = g.getStackGovernanceConfigs();
    return { success: result && result.source === 'stack' };
});

// (Issue #173 QC) decide persists durably: a FRESH module load (simulated
// restart via require-cache eviction, same technique as
// test/forum-decisions-persistence.test.js) hydrates the decision log back
// — cross-process list/stats/status observation works.
require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true
});

function execCli(args) {
    const { execFileSync } = require('child_process');
    return execFileSync('node', [path.join(ROOT, 'bin', 'governance.js'), ...args], {
        encoding: 'utf8', timeout: 60000
    });
}

let barcoded = 'qc-gov-' + Date.now().toString(36);

test('#173 decide persists across processes (fresh CLI observes the record)', () => {
    // execFileSync is SYNCHRONOUS — the harness's test() is try/catch-based
    // and swallows rejections from async fns, so keep these sync.
    const outDecide = execCli(['decide', barcoded, 'persist probe']);
    if (!outDecide.includes('APPROVED')) throw new Error('decide did not approve: ' + outDecide);
    return true;
});

test('#173 status <topic> is awaited and reads the recorded decision (fresh process)', () => {
    const out = execCli(['status', barcoded]);
    if (!out.includes('Allowed: YES')) throw new Error('status did not observe the prior decision: ' + out);
    return true;
});

test('#173 list prints d.action (was "- undefined" forever)', () => {
    const out = execCli(['list']);
    if (!out.includes(barcoded)) throw new Error('list lost the record: ' + out.slice(0, 200));
    if (out.includes('- undefined')) throw new Error('list still prints undefined rows: ' + out.slice(0, 200));
    return true;
});

test('#173 stats reads real getStats() keys (Allowed was always 0)', () => {
    const out = execCli(['stats']);
    const m = out.match(/Approved:\s*(\d+)/);
    if (!m) throw new Error('stats output shape changed: ' + out);
    if (Number(m[1]) < 1) throw new Error('Approved stayed 0 after approvals: ' + out);
    return true;
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
