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

// (B0, issue #253) THE GRANT LEDGER. Precedence is declared and deny-wins,
// revocation is a tombstone (never a delete that resumes default-allow),
// scope is isolating (shared parents confer nothing), and trust floors are
// enforced in the decision engine. Also pins: the legacy check() gate is
// untouched by the ledger's presence.
test('rules grant ledger: precedence is declared, deny-wins, order-independent (B0 #253)', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = 'b0-pin-' + Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'p' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 1 });
    const denyFirst = rules.grantLedger({ principal: 'p' + tag, capability: 'cap' + tag, permit: 'deny', precedence: 2 });
    let v = rules.evaluate('cap' + tag, { principal: 'p' + tag });
    if (v.allowed !== false) throw new Error('precedence-2 deny lost to the precedence-1 allow');
    if (v.rule !== denyFirst.id) throw new Error('winner id not reported: ' + JSON.stringify(v));
    return true;
});

test('rules grant ledger: revocation tombstone carries, never resumes default-allow (B0 #253)', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = 'b0-pin-' + Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'p' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 1 });
    if (rules.evaluate('cap' + tag, { principal: 'p' + tag }).allowed !== true) throw new Error('baseline allow missing');
    rules.revokeGrants({ principal: 'p' + tag, capability: 'cap' + tag });
    const v = rules.evaluate('cap' + tag, { principal: 'p' + tag });
    if (v.allowed !== false) throw new Error('revocation did not carry (' + JSON.stringify(v) + ')');
    // a HIGHER-precedence explicit allow is the only path out of the tombstone
    rules.grantLedger({ principal: 'p' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 3 });
    const v2 = rules.evaluate('cap' + tag, { principal: 'p' + tag });
    if (v2.allowed !== true) throw new Error('higher-precedence re-grant disallowed entirely: ' + JSON.stringify(v2));
    return true;
});

test('rules grant ledger: scope isolation - shared parents confer nothing (B0 #253)', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = 'b0-pin-' + Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'p' + tag, capability: 'notes:write' + tag, scope: 'brain/ledger-alpha', permit: 'allow' });
    if (rules.evaluate('notes:write' + tag, { principal: 'p' + tag, scope: 'brain/ledger-beta' }).allowed !== false) {
        throw new Error('sideways capability leak: alpha grant resolved a beta ask');
    }
    if (rules.evaluate('notes:write' + tag, { principal: 'p' + tag, scope: 'brain/ledger-alpha' }).allowed !== true) {
        throw new Error('exact-scope grant did not resolve');
    }
    return true;
});

test('rules grant ledger: trust floor enforced in the engine (B0 #253)', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = 'b0-pin-' + Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'p' + tag, capability: 'estate:rewrite-roots' + tag, permit: 'allow', trust: 2, role: 'successor' });
    const v = rules.evaluate('estate:rewrite-roots' + tag, { principal: 'p' + tag, scope: 'deep-private', trustFloor: 3 });
    if (v.allowed !== false) throw new Error('trust floor breached: ' + JSON.stringify(v));
    if (!/trust floor/.test(v.reason)) throw new Error('floor denial lost its reason: ' + JSON.stringify(v));
    return true;
});

test('rules grant ledger: successor resolution is a deterministic function of declared precedence', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = 'b0-pin-' + Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'heir-alpha' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 2, role: 'successor' });
    rules.grantLedger({ principal: 'heir-beta' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 1, role: 'successor' });
    const w1 = rules.evaluate('cap' + tag, {});
    const w2 = rules.evaluate('cap' + tag, {});
    if (w1.allowed !== true || w2.allowed !== true) throw new Error('successor ask denied: ' + JSON.stringify(w1));
    if (w1.principal !== 'heir-alpha' + tag) throw new Error('precedence winner not answered: ' + JSON.stringify(w1));
    if (w1.principal !== w2.principal) throw new Error('resolution unstable: ' + w1.principal + ' vs ' + w2.principal);
    return true;
});

test('rules legacy check() gate untouched by the ledger (B0 #253)', () => {
    const rules = require(path.join(ROOT, 'lib', 'rules'));
    const tag = Math.random().toString(36).slice(2, 8);
    rules.grantLedger({ principal: 'p' + tag, capability: 'cap' + tag, permit: 'allow', precedence: 5 });
    if (rules.check('cap' + tag, {}).allowed !== true) throw new Error('ledger presence changed the legacy allow fallthrough');
    if (rules.check('vant_shell_exec' + tag, {}).allowed !== false) throw new Error('ledger presence changed the default-deny floor');
    return true;
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
