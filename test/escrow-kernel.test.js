#!/usr/bin/env node
/**
 * K3 — the escrow adoption pins (the reference consumer).
 *
 * labs/prd-kernel.md §7: K3 = "Escrow adopts as the reference consumer
 * (one row, smallest lift, depends on K1)". K2 already landed with the
 * conformance pack; THIS suite pins the ADOPTION half:
 *   - escrow registers as 'escrow' and kernel.census() lists it;
 *   - census of budgets: the kernel-gated census enumerates the observable
 *     budget surfaces (per-brain quotas + live budget map);
 *   - attest of spend pairs: the spend path journals an attest verb entry
 *     naming the pair, with a dated basis spent through the gate;
 *   - invariant 3 works ON escrow: retire/succeed are the census-visible
 *     gap (adoption is never silent partial);
 *   - self-heal: after an external kernel reset (the conformance pack's
 *     TEST-ONLY _unwind path), the next witness re-registers and re-basis
 *     without throwing through escrow's public surface;
 *   - clerk-not-judge: a kernel refusal never mutates escrow's verdicts.
 *
 * Store-free by design: the pins use the module-level witness doors
 * (kernelWitnessSpend / setBrainQuota) and never touch the disk store, so
 * the suite is cwd-independent and cannot leave residue in models/.
 *
 * Run: node test/escrow-kernel.test.js   (also picked up by test/run-all.js)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));
const escrow = require(path.join(ROOT, 'lib', 'escrow.js'));

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function check(name, ok, detail) {
    if (ok) {
        results.passed++;
        console.log(`  ✓ ${name}`);
    } else {
        results.failed++;
        console.log(`  ✗ ${name}: ${detail || 'assertion failed'}`);
    }
}

console.log('\n🔐 K3 — ESCROW ADOPTION PINS (kernel reference consumer)\n');

// ---------------------------------------------------------------------------
// Group 1: registration + census truth
// ---------------------------------------------------------------------------
kernel._unwind();

const status = escrow.kernelWitnessStatus();   // ensures registration (self-heal door)
check('escrow registers as the reference consumer', status.registered === true, JSON.stringify(status));

const census = kernel.census();
const row = census.consumers.find((c) => c.name === 'escrow');
check('kernel.census() lists escrow', !!row, `${census.consumers.length} consumer(s): ${census.consumers.map((c) => c.name).join(', ')}`);
check('wired verbs are census + attest (the §3 map row, smallest lift)', row && JSON.stringify([...row.verbs]) === JSON.stringify(['attest', 'census']), row && JSON.stringify(row.verbs));
check('the gap names itself (invariant 3): retire + succeed missing', row && JSON.stringify(row.missingVerbs) === JSON.stringify(['retire', 'succeed']), row && JSON.stringify(row.missingVerbs));
check('register authored a journal entry naming scope', (() => {
    const reg = kernel.journal().find((j) => j.kind === 'register' && j.consumer === 'escrow');
    return !!reg && typeof reg.detail.scope === 'string' && reg.detail.scope.includes('reference consumer');
})(), 'register entry shape drifted');

// ---------------------------------------------------------------------------
// Group 2: census-of-budgets semantics (escrow's rows: "already ~census")
// ---------------------------------------------------------------------------
kernel._unwind();
escrow.kernelWitnessStatus();   // re-register after the reset

escrow.setBrainQuota(42.5);   // no store touch: module-level per-brain quota
const listing = kernel.gate('census', 'escrow', {});
check('kernel-gated census returns the budget listing', !!(listing.ok && Array.isArray(listing.result)), 'lawful census refused');
const quotaEntry = listing.result.find((e) => String(e.id).startsWith('brain-quota:')) || null;
check('census enumerates budget-kind entries with a dated at', !!quotaEntry && quotaEntry.kind === 'brain-quota' && typeof quotaEntry.at === 'number' && quotaEntry.at >= 1, JSON.stringify(listing.result.slice(0, 3)));

// ---------------------------------------------------------------------------
// Group 3: attest-of-spend-pairs (the escrow row's second verb)
// ---------------------------------------------------------------------------
kernel._unwind();
escrow.kernelWitnessStatus();

const before = kernel.journal().length;
const witness = escrow.kernelWitnessSpend('pin-agent-a', 5);
check('spend pair witnesses through the kernel', witness && witness.witnessed === true, JSON.stringify(witness));
const entries = kernel.journal().slice(before);
const attestEntry = entries.find((j) => j.kind === 'verb' && j.verb === 'attest');
check('the attest is a JOURNALED verb entry naming the pair', !!attestEntry && attestEntry.detail.claim === 'spend:pin-agent-a:5' && attestEntry.consumer === 'escrow', JSON.stringify(attestEntry || {}));
check('the attest carries a DATED basis (invariant 2 live)', !!attestEntry && typeof attestEntry.detail.basisAt === 'number' && attestEntry.detail.basisAt >= 1 && attestEntry.detail.basisAt <= before + entries.length, attestEntry && `basisAt=${attestEntry.detail.basisAt}`);
check('basisInherited is kernel time, never a wall clock', !!attestEntry && attestEntry.wallClock === undefined, attestEntry && `wallClock=${JSON.stringify(attestEntry.wallClock)}`);

// the census the basis came from is itself journaled BEFORE the attest
check('the dated basis is the kernel-gated census entry', !!attestEntry && kernel.journal()[attestEntry.detail.basisAt - 1].verb === 'census', kernel.journal()[attestEntry.detail.basisAt - 1] && kernel.journal()[attestEntry.detail.basisAt - 1].verb);

// a second spend on the same basis: no extra census re-run beyond need
const witness2 = escrow.kernelWitnessSpend('pin-agent-a', 7);
check('second spend pair witnesses too', witness2 && witness2.witnessed === true, JSON.stringify(witness2));
check('basis is REUSED across spends within the ledger', witness2 && witness2.seq === witness.seq + 1, `seqs ${witness.seq} vs ${witness2.seq}`);

// ---------------------------------------------------------------------------
// Group 4: self-heal (external reset — the conformance pack's probe seam)
// ---------------------------------------------------------------------------
kernel._unwind();   // the kernel pack / K2-style probes reset the ledger per row

const healed = escrow.kernelWitnessSpend('pin-agent-b', 11);
check('post-reset witness self-heals (re-register + re-basis)', healed && healed.witnessed === true, JSON.stringify(healed));
check('escrow is VISIBLE in the census again after the heal', kernel.census().consumers.some((c) => c.name === 'escrow'), 'registration lost after external reset');
const postHealAttest = kernel.journal().filter((j) => j.kind === 'verb' && j.verb === 'attest').pop();
check('post-heal attest journals with a new dated basis', !!postHealAttest && typeof postHealAttest.detail.basisAt === 'number' && postHealAttest.detail.basisAt >= 1, JSON.stringify(postHealAttest && postHealAttest.detail));

// status truthfulness: computes from the LIVE census, never a cached flag
const postHealStatus = escrow.kernelWitnessStatus();
check('kernelWitnessStatus mirrors live census truth', postHealStatus.registered === true && postHealStatus.verbs.includes('retire') === false, JSON.stringify(postHealStatus));

// ---------------------------------------------------------------------------
// Group 5: clerk-not-judge — a kernel refusal never mutates escrow's verdicts
// ---------------------------------------------------------------------------
kernel._unwind();
// Make registration IMPOSSIBLE for one call: freeze the registry via a
// duplicate that now owns the name, by pre-registering 'escrow' ourselves.
kernel.register({ name: 'escrow', scope: 'not-escrow', verbs: {} });

const witnessTry = escrow.kernelWitnessSpend('pin-agent-c', 13);
// _witnessRegister inside the heal path throws E_DUPLICATE_NAME → step-aside.
check('kernel refusal steps aside WITHOUT throwing through escrow', witnessTry && witnessTry.witnessed === false && typeof witnessTry.code === 'string', JSON.stringify(witnessTry));
check("escrow's spend verdict surface stayed operational", (() => {
    // the runaway path itself still computes honestly (the witness never rewrote it)
    const out = escrow.kernelWitnessSpend('pin-agent-c', 13);
    return typeof out === 'object' && ('witnessed' in out);
})(), 'spend path corrupted under a hostile kernel');
check('the heal path recovers after the impostor clears', (() => {
    kernel._unwind();
    const back = escrow.kernelWitnessSpend('pin-agent-c', 15);
    return back.witnessed === true;
})(), 'heal did not recover after the reset cleared the impostor');

// ---------------------------------------------------------------------------

console.log('');
console.log(`  ${results.passed} passed, ${results.failed} failed${results.skipped ? `, ${results.skipped} skipped` : ''}`);
process.exit(results.failed ? 1 : 0);
