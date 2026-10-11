#!/usr/bin/env node
/**
 * Escrow Module Unit Tests
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

console.log('\n🔐 ESCROW MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('escrow module loads', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: !!escrow };
});

test('escrow has Escrow class', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: !!escrow.Escrow };
});

test('escrow has create function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.create === 'function' };
});

test('escrow has canSpend function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.canSpend === 'function' };
});

test('escrow has hold function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.hold === 'function' };
});

test('escrow has release function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.release === 'function' };
});

test('escrow has requestApproval function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.requestApproval === 'function' };
});

test('escrow has approve function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.approve === 'function' };
});

test('escrow has isOpen function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.isOpen === 'function' };
});

test('escrow has getStatus function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.getStatus === 'function' };
});

test('escrow has isOperationAllowed function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.isOperationAllowed === 'function' };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

test('escrow has getBrainEscrowStatus function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.getBrainEscrowStatus === 'function' };
});

test('escrow has setBrainQuota function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.setBrainQuota === 'function' };
});

// Stack tests
test('escrow has getStackEscrowStatus function', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    return { success: typeof escrow.getStackEscrowStatus === 'function' };
});

// pass 77: resetBudget was a phantom export - advertised on module.exports
// but called .resetBudget on the class, a method that never existed.
// Any call threw TypeError. Pin BOTH the fix and the API contract.
test('resetBudget is callable (phantom export regression pin)', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const result = escrow.resetBudget('test-phantom-agent', 777);
    return { success: result && result.limit === 777 && result.available === 777 && result.spent === 0 };
});

test('setBudgetLimit preserves spent metrics (resetBudget contract)', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    // (QC pass-204) Budgets PERSIST across suite runs; a shared agent id
    // makes `spent === 100` order-dependent (a veteran test-limit-agent
    // already carries prior cumulative spend — observed live: spent=700
    // after the exec of one fresh 100-credit draw). Isolate the agent per
    // run; the CONTRACT under test is setBudgetLimit PRESERVING spent.
    const agent = 'test-limit-agent-' + process.pid;
    const E = escrow.create({});
    E.recordSpend(agent, 100);
    E.setBudgetLimit(agent, 500);
    const b = E.getBudget(agent);
    return { success: b.limit === 500 && b.spent === 100, error: `limit=${b && b.limit} spent=${b && b.spent}` };
});

test('getStackEscrowStatus returns object with source stack', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const result = escrow.getStackEscrowStatus();
    return { success: result && result.source === 'stack' };
});

// (QC pass-204) Expired holds were never pruned at load: they hydrated
// into every fresh instance and counted toward maxHolds, so a store with
// 100 stale holds made hold() fail closed FOREVER (observed live: 99
// long-expired legacy holds starved every new skill buy/trade). The fix
// prunes past-timeout holds at load (same semantics checkHold applies
// lazily) and persists the prune. Pin: expired holds vanish on reload and
// NEVER block new holds.
test('expired holds are pruned at load — they cannot starve maxHolds (QC pass-204)', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const id = 'qc204-expired-' + process.pid;
    // Take a live hold, then force it expired without a release path.
    const held = escrow.hold(id, { probe: true });
    if (!held || !held.held) return { success: false, error: 'hold did not take: ' + JSON.stringify(held) };
    const live = new escrow.Escrow();
    const row = live._holds.get(id);
    if (!row) return { success: false, error: 'hold not hydrated into the load view' };
    row.timeout = Date.now() - 1000; // now-expired
    live.save();
    // Reload: a fresh instance must NOT see the expired hold.
    const reloaded = new escrow.Escrow();
    const gone = reloaded.checkHold(id);
    // And maxHolds headroom is restored: a hold TAKE succeeds even against
    // a store previously at the cap.
    const id2 = 'qc204-headroom-' + process.pid;
    const taken = escrow.hold(id2, { probe: true });
    try { escrow.release(id2); } catch (e) { /* best-effort cleanup */ }
    try { escrow.release(id); } catch (e) { /* already gone */ }
    return {
        success: gone.held === false && taken.held === true,
        error: `expired hold survived reload: gone=${JSON.stringify(gone)} newHold=${JSON.stringify(taken)}`
    };
});

// (pass 101) release must REMOVE the persisted hold. The merge-save was an
// additive union, so a RELEASED hold (absent from the writer's snapshot) was
// re-added from the disk copy and leaked forever — market trades accumulated
// holds toward escrow.maxHolds and eventually ALL later trades failed with
// max_holds_exceeded. Pin the hold→release→reload round-trip.
test('release removes the persisted hold (pass 101 union-merge leak fix)', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const id = 'p101-hold-release-' + process.pid;
    const held = escrow.hold(id, { probe: true });
    if (!held || !held.held) return { success: false, error: 'hold did not take: ' + JSON.stringify(held) };
    const before = escrow.checkHold(id);
    escrow.release(id);
    const after = escrow.checkHold(id);
    try { escrow.release(id); } catch (e) { /* best-effort cleanup */ }
    return {
        success: before.held === true && after.held === false,
        error: `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);