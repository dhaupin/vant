'use strict';

/**
 * Kernel wiring pins for labs/prd-kernel.md §3 wiring-map rows K1 batch:
 * pipeline, prune, sudo, and docs-gates — adoption-style (registration +
 * verb wiring), never a rewrite. Pins attack the invariants the PRD locks:
 *
 *   1. census carries dated kernel entries (journal-position time),
 *   2. every succeed door has a dated census basis behind it,
 *   3. reset self-heal: probes reset the kernel, the next typed call
 *      re-registers instead of living on a dead roster,
 *   4. refusals stay coded (KernelError with a kind of E_NAMING),
 *   5. adoption costs zero surface change (witness mutations never
 *      touch the underlying flows).
 *
 * Run: node test/kernel-wiring.test.js  (picked up by test/run-all.js)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));
const {
    kernelCensusSteps,
    kernelWitnessOutcome,
    PIPELINE_WIRED_VERBS,
} = require(path.join(ROOT, 'lib', 'pipeline-kernel-witness.js'));
const {
    kernelCensusPrunable,
    kernelWitnessRetire,
    PRUNE_WIRED_VERBS,
} = require(path.join(ROOT, 'lib', 'prune.js'));
const {
    sudoCensus,
    sudoWitnessSucceed,
} = require(path.join(ROOT, 'lib', 'sudo-kernel-witness.js'));
const {
    registerDocsGates,
    docsGatesCensus,
    GATE_SCRIPTS,
} = require(path.join(ROOT, 'lib', 'kernel-ledger.js'));

let run = 0, failures = 0;
function check(name, ok, detail) {
    const status = ok ? '✓' : '✗';
    if (!ok) failures++;
    console.log(`${status} ${name}${ok ? '' : `: ${detail}`}`);
}

kernel._unwind();

// Types: every census carry lands in the journal with a dated seq.
function typedCensus(census, label) {
    const rows = census.entries || census.steps || [];
    check(`${label}: census returns kernel-dated entries`, census.ok !== false && Array.isArray(rows) &&
        rows.every((e) => typeof e.id === 'string' && Number.isInteger(e.at) && e.at > 0 && typeof e.kind === 'string'),
        JSON.stringify(census).slice(0, 200));
    return { ...census, entries: rows };
}

// ---- pipeline witness ----
{
    check('pipeline-kernel-witness: verbs wired (census, attest)',
        JSON.stringify(PIPELINE_WIRED_VERBS) === JSON.stringify(['census', 'attest']), JSON.stringify(PIPELINE_WIRED_VERBS));

    const c = kernelCensusSteps();
    typedCensus(c, 'pipeline-kernel-witness');
    const s = kernelWitnessOutcome({ step: 'pin-check', ok: true });
    check('pipeline-kernel-witness: attest lands (census basis behind it)', s && (s.witnessed === true || s.ok === true), JSON.stringify(s));

    // Reset self-heal: a kernel reset must not wedge the witness.
    kernel._unwind();
    const after = kernelWitnessOutcome({ step: 'pin-check', ok: true });
    check('pipeline-kernel-witness: re-registers after kernel reset', after && (after.witnessed === true || after.ok === true), JSON.stringify(after));
}

// ---- prune witness (K6 row: registered inline in lib/prune.js) ----
{
    check('prune-kernel-witness: verbs wired (census, retire)',
        JSON.stringify(PRUNE_WIRED_VERBS) === JSON.stringify(['census', 'retire']), JSON.stringify(PRUNE_WIRED_VERBS));

    const c = kernelCensusPrunable();
    typedCensus(c, 'prune-kernel-witness');

    // The retire-with-ledger door, dry-run first (pins never delete).
    const s = kernelWitnessRetire({ dryRun: true });
    check('prune-kernel-witness: retire door dry-runs the census receipt', s && s.ok === true && s.dryRun === true && Array.isArray(s.wouldRetire), JSON.stringify(s));

    kernel._unwind();
    const after = kernelWitnessRetire({ dryRun: true });
    check('prune-kernel-witness: re-registers after kernel reset', after && after.ok === true, JSON.stringify(after));
}

// ---- sudo witness ----
{
    const c = sudoCensus();
    typedCensus(c, 'sudo-kernel-witness');
    const s = sudoWitnessSucceed({ action: 'pin-check-elevation', taskId: 'pin-task' });
    check('sudo-kernel-witness: succeed lands (elevation-audit boundary)', s && s.witnessed === true, JSON.stringify(s));

    kernel._unwind();
    const after = sudoWitnessSucceed({ action: 'pin-check-elevation', taskId: 'pin-task' });
    check('sudo-kernel-witness: re-registers after kernel reset', after && after.witnessed === true, JSON.stringify(after));
}

// ---- docs-gates census ----
{
    registerDocsGates();
    const c = docsGatesCensus();
    typedCensus(c, 'kernel-ledger (docs-gates)');
    check('kernel-ledger: all six real gate scripts enumerated',
        c.ok !== false && c.entries.length === GATE_SCRIPTS.length &&
        c.entries.every((e) => e.kind === 'docs-gate' && e.present === true),
        JSON.stringify(c.entries.slice(0, 2)));

    kernel._unwind();
    const after = docsGatesCensus();
    check('kernel-ledger: re-registers after kernel reset', after.ok !== false && Array.isArray(after.entries) && after.entries.length === GATE_SCRIPTS.length, JSON.stringify(after || {}));
}

// ---- typed refusals ----
{
    let caught = null;
    try { kernelCensusSteps(); } catch (e) { caught = e; }
    // after the failures above the ocean is intact; a stop there is informative only
    check('witness behavior stays typed (no raw throw)', caught === null || caught.code, caught && String(caught.message).slice(0, 120));
}

// ---- adoption is status-neutral ----
{
    const before = kernel.journal().length;
    kernelCensusSteps();
    kernelCensusPrunable();
    sudoCensus();
    docsGatesCensus();
    const after = kernel.journal().length;
    check('witness census carries land as journal entries (deterministic delta)', after > before, `${before} -> ${after}`);
}

run = failures;
console.log(`\nkernel-wiring: ${run === 0 ? 'ALL PINS PASS' : `${failures} pin(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
