#!/usr/bin/env node
/**
 * ci-crashtest-gate.js - the CI gate for vant's crashtest pack matrix.
 *
 * TWO PHASES, one policy (the known-findings whitelist is the only
 * carve-out; anything else is a regression):
 *
 *   A. CONTRACT TABLE — runs test/crashtest-packs.test.js with
 *      CRASHTEST_PACKS_JSON=1, takes its sentinel-delimited verdict ledger
 *      (every verdict row + the expected-verdict table it was measured
 *      against), and enforces the policy:
 *        - every EXPLOITED (non-skipped) row must be whitelisted here;
 *        - every whitelisted row must still exist in the table (a fix that
 *          flips a pinned row REFUSED succeeds the gate and LOUDLY asks for
 *          the whitelist line to be deleted — a stale whitelist never
 *          silently lingers);
 *        - the table itself already held (the suite exits 0 — that also
 *          proves every strict row was EARNED, not skipped, and that the
 *          double-run determinism held).
 *
 *   B. REAL HARNESS — runs scripts/crashtest-run.js with
 *      CRASHTEST_RUN_POLICY=strict. The real pack loader + Harness drives
 *      the armed shim routes and the scenario-library rows; exit codes:
 *        0 = clean (only whitelisted findings if any); 4 = a finding
 *      outside the whitelist (pack rows); 3 = a library-scenario finding;
 *      1 = run fault. All of 1/3/4 fail the gate with output attached.
 *
 * Policy: ALLOWED_FINDINGS below. When a row's fix lands and it flips to
 * REFUSED, delete its whitelist line (phase A asks loudly; phase B's
 * run-root strict mode is whitelist-driven by KNOWN_FINDINGS in
 * scripts/crashtest-run.js — keep the two in lockstep).
 *
 * Usage:
 *   node test/ci-crashtest-gate.js            # both phases
 *   node test/ci-crashtest-gate.js --phase=a  # contract table only
 *   node test/ci-crashtest-gate.js --phase=b  # run root only
 *   node test/ci-crashtest-gate.js --json     # machine-readable summary
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// The known-finding whitelist — KEEP IN LOCKSTEP with KNOWN_FINDINGS in
// scripts/crashtest-run.js. A pinned finding is HONEST, verified research:
// it stays EXPLOITED until the fix lands, and the pin keeps biting.
const ALLOWED_FINDINGS = {
    // Whitelist is EMPTY as of the 2026-10-22 read-side trust gate: the
    // succession trust floor is enforced at the brain.read seam now, so
    // every oracle measures REFUSED (or an honest bounded skip). If a new
    // genuine finding gets measured and pinned, its line belongs here and
    // in scripts/crashtest-run.js KNOWN_FINDINGS — added in the SAME commit
    // as the pin, and deleted in the same commit as its fix.
};

const args = process.argv.slice(2);
const phaseOpt = (() => {
    const hit = args.find((a) => a.startsWith('--phase'));
    if (!hit) return null;
    if (hit.includes('=')) return hit.split('=')[1];
    const idx = args.indexOf(hit);
    const next = args[idx + 1];
    return next && !next.startsWith('--') ? next : hit.replace('--phase', '');
})();
const asJson = args.includes('--json');
const phase = ['a', 'b'].includes(phaseOpt) ? phaseOpt : null;

const SUITE_TIMEOUT_MS = 8 * 60 * 1000;
const RUNROOT_TIMEOUT_MS = 15 * 60 * 1000;

const GATE_SENTINEL = /CRASHTEST_PACKS_GATE<<([\s\S]*?)>>END/;

function tail(text, lines = 12) {
    const arr = String(text || '').trim().split('\n');
    return arr.slice(-lines).join('\n');
}

function runPhaseA() {
    const r = spawnSync(process.execPath, ['test/crashtest-packs.test.js'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: SUITE_TIMEOUT_MS,
        env: { ...process.env, CRASHTEST_PACKS_JSON: '1' },
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) { return { ok: false, name: 'A: contract table', reason: `gate could not run the suite: ${r.error}` }; }
    if (r.status !== 0) {
        return {
            ok: false,
            name: 'A: contract table',
            reason: `suite exited ${r.status} (expected-table runtime or earning failure)`,
            output: tail(r.stdout, 25),
        };
    }
    const hit = String(r.stdout || '').match(GATE_SENTINEL);
    if (!hit) {
        return { ok: false, name: 'A: contract table', reason: 'verdict ledger sentinel missing — the suite did not dump a machine-readable table' };
    }
    let dump;
    try { dump = JSON.parse(hit[1]); } catch (e) {
        return { ok: false, name: 'A: contract table', reason: `verdict ledger was not JSON: ${e.message}` };
    }
    const violations = [];
    const flipNotes = [];
    for (const [pack, { expects, verdicts }] of Object.entries(dump)) {
        for (const [attack, row] of Object.entries(verdicts || {})) {
            const id = `${pack}/${attack}`;
            if (row.verdict === 'EXPLOITED' && !row.skipped) {
                if (!Object.prototype.hasOwnProperty.call(ALLOWED_FINDINGS, id)) {
                    violations.push(`${id}: ${String(row.detail).slice(0, 140)}`);
                }
            }
        }
        for (const id of Object.keys(ALLOWED_FINDINGS)) {
            const [p, a] = id.split('/');
            if (p !== pack) continue;
            const row = (verdicts || {})[a];
            if (row && row.verdict === 'REFUSED' && !row.skipped) {
                flipNotes.push(`${id}: now REFUSED — fix landed, delete the whitelist line (both this gate and scripts/crashtest-run.js KNOWN_FINDINGS)`);
            }
        }
        void expects; // the suite itself already enforced expected-table holding (exit 0)
    }
    for (const id of Object.keys(ALLOWED_FINDINGS)) {
        const [pack, attack] = id.split('/');
        if (!dump[pack] || !dump[pack].verdicts[attack]) {
            flipNotes.push(`${id}: whitelisted but NOT in the measured ledger — stale whitelist entry, delete it`);
        }
    }
    if (violations.length) {
        return {
            ok: false,
            name: 'A: contract table',
            reason: `${violations.length} EXPLOITED finding(s) outside the known-finding whitelist — gate FAILS`,
            violations,
            flipNotes,
        };
    }
    return { ok: true, name: 'A: contract table', flipNotes, packs: Object.keys(dump).length };
}

function runPhaseB() {
    const r = spawnSync(process.execPath, ['scripts/crashtest-run.js'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: RUNROOT_TIMEOUT_MS,
        env: { ...process.env, CRASHTEST_RUN_POLICY: 'strict' },
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) { return { ok: false, name: 'B: real harness', reason: `gate could not run the run root: ${r.error}` }; }
    const status = r.status === null ? -1 : r.status;
    if (status === 0) { return { ok: true, name: 'B: real harness', note: 'clean (only whitelisted findings if any)' }; }
    const EXIT = { 1: 'run fault', 3: 'library finding', 4: 'finding outside the whitelist' };
    // (detail-through 2026-10-28) the run root already prints each finding
    // row with its full detail; surfacing THE FINDING LINES verbatim next
    // to the strict-policy verdict means a CI RED is diagnosable from the
    // log alone (tail-25 was hiding the pack-phase ✗ rows the strict
    // policy named).
    const findingLines = String(r.stdout || '').split('\n').filter((l) =>
        l.includes('✗') || l.trim().startsWith('finding:') || l.startsWith('===') || l.trim().startsWith('unknown finding'));
    return {
        ok: false,
        name: 'B: real harness',
        reason: `run root exited ${status} (${EXIT[status] || 'unknown code'})`,
        output: [...findingLines, '', tail((r.stdout || '') + '\n' + (r.stderr || ''), 25)].join('\n'),
    };
}

const phases = [];
if (phase !== 'b') phases.push(runPhaseA);
if (phase !== 'a') phases.push(runPhaseB);

const results = phases.map((fn) => {
    const res = fn();
    if (asJson) return { name: res.name, ok: !!res.ok, reason: res.reason, violations: res.violations };
    if (res.ok) {
        console.log(`PASS ${res.name}${res.note ? ` — ${res.note}` : ''}`);
        for (const n of res.flipNotes || []) console.log(`  note: ${n}`);
    } else {
        console.error(`FAIL ${res.name} — ${res.reason}`);
        for (const v of res.violations || []) console.error(`  unauthorized finding: ${v}`);
        if (res.output) console.error(res.output);
        for (const n of res.flipNotes || []) console.error(`  note: ${n}`);
    }
    return res;
});

const ok = results.every((r) => r.ok);
console.log(ok
    ? `crashtest gate: GREEN (${results.filter((r) => r.ok).map((r) => r.name).join(' + ')}) — no findings outside the known-finding whitelist`
    : 'crashtest gate: RED — see the findings above; every raise is either the whitelist line to delete or a regression to fix');
process.exit(ok ? 0 : 1);
