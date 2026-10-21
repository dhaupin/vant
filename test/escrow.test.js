#!/usr/bin/env node
/**
 * Escrow Module Unit Tests
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// (pass 287) the escrow lib writes through state-store's PATH-ACTIVE
// resolver (VANT_BRAIN env > models/state.json > 'vant'); the disk pin
// below hardcoded 'vant', so an env-scoped run level-failed with ENOENT
// while the lib wrote the right file. Capture BEFORE any chdir.
const { resolveActiveBrain } = require('./active-brain');
const ACTIVE_BRAIN = resolveActiveBrain(ROOT);

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
// (pass 251, issue #204) APPROVAL LANE — exact-family, TTL, single-use
// ============================================

test('#204 exact/family matching: `delete` no longer over-matches `note_delete_typo`', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const e = new escrow.Escrow({ approvalRequired: ['delete'] });
    return { success: e.needsApproval('delete') && !e.needsApproval('note_delete_typo') && !e.needsApproval('read') };
});

test('#204 family globs: `write:*` matches `write:critical` but not `brainwrite`', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const e = new escrow.Escrow({ approvalRequired: ['write:*'] });
    return { success: e.needsApproval('write') && e.needsApproval('write:critical') && !e.needsApproval('brainwrite') };
});

test('#204 single-use: consumeApproval burns the row — reuse denied', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const e = new escrow.Escrow({ approvalRequired: ['destructive:*'], approvalTtlMs: 60000 });
    const req = e.requestApproval('destructive:wipe', 'test');
    e.approve(req.approvalId, 'owner');
    const first = e.consumeApproval(req.approvalId, 'destructive:wipe');
    const second = e.consumeApproval(req.approvalId, 'destructive:wipe');
    return { success: first.approved === true && second.approved === false && second.reason === 'not_found' };
});

test('#204 approval bind: an approval for one op cannot be spent on another', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const e = new escrow.Escrow({ approvalRequired: ['delete'], approvalTtlMs: 60000 });
    const req = e.requestApproval('delete', 'test');
    e.approve(req.approvalId, 'owner');
    const mis = e.consumeApproval(req.approvalId, 'admin');
    return { success: mis.approved === false && mis.reason === 'operation_mismatch' };
});

test('#204 TTL: an expired approval fails consumption and reports expired', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    // ttl -1 = already past its window at any later Date.now() tick (the
    // consume-time TTL contract: approval time is checked, not wall-clock magic)
    const e = new escrow.Escrow({ approvalRequired: ['admin'], approvalTtlMs: -1 });
    const req = e.requestApproval('admin', 'test');
    e.approve(req.approvalId, 'owner');
    const stale = e.checkApproval(req.approvalId);
    const spent = e.consumeApproval(req.approvalId, 'admin');
    return { success: stale.approved === false && stale.reason === 'expired' && spent.approved === false && spent.reason === 'expired' };
});

// (pass 257) The disk-coherent burn: a consumed approval can NEVER be
// resurrected from disk. Found through the traveler escalation lane: the
// _saveEscrow merge-union re-added a consumed approval's disk row on the
// next save from ANY instance, so a "single-use" approval authorized a
// second execution forever AFTER a restart (the fresh instance happily
// hydrated the ghost row and consumed it again). The fix rides the pass-101
// hold-tombstone contract over to approvals (deletedApprovals).
test('#204/#257 disk-coherent burn: consumed approval never resurrects from disk', () => {
    const escrow = require(path.join(ROOT, 'lib', 'escrow'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-escrow-i5b-'));
    try {
        const dir = path.join(tmp, 'models', 'private');
        fs.mkdirSync(path.join(dir, ACTIVE_BRAIN), { recursive: true });
        process.chdir(tmp);

        // 1) mint + persist on one instance — the disk row EXISTS before the burn
        // (the door/road flow: request/save, a different instance approves+consumes)
        const e1 = new escrow.Escrow({ approvalRequired: ['delete'] });
        const req = e1.requestApproval('delete', 'i5b');
        e1.save();

        // 2) a fresh instance hydrates the row from disk, approves, and burns
        const e2 = new escrow.Escrow({ approvalRequired: ['delete'] });
        e2.approve(req.approvalId, 'owner');
        const spent = e2.consumeApproval(req.approvalId, 'delete');
        e2.save();

        // the disk row itself must be gone (the tombstone applied to the union)
        const disk = JSON.parse(fs.readFileSync(path.join(dir, ACTIVE_BRAIN, 'orgchart', 'escrow.json'), 'utf8'));
        if (disk.approvals && disk.approvals[req.approvalId]) {
            return { success: false, error: 'consumed approval still on disk (union resurrected it)' };
        }

        // 3) a THIRD instance hydrated from that disk must refuse to re-spend
        const e3 = new escrow.Escrow({ approvalRequired: ['delete'] });
        const reSpend = e3.consumeApproval(req.approvalId, 'delete');
        return { success: spent.approved === true
            && reSpend.approved === false && reSpend.reason === 'not_found' };
    } finally {
        process.chdir(ROOT);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Total:   ${results.passed + results.failed}`);

process.exit(results.failed > 0 ? 1 : 0);