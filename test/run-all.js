#!/usr/bin/env node
/**
 * Vant Full-Suite Sweep Runner (pass 32, v1.0.0 release gate #1)
 *
 * Runs EVERY test/*.test.js suite in its own process with a per-suite
 * timeout, then prints a categorized summary. This is the "nothing hides"
 * runner: build-test + test-all only cover ~32 suites; the repo ships 115.
 *
 * Usage:
 *   node test/run-all.js                 # run all, print summary
 *   node test/run-all.js --only=market   # comma-separated substrings
 *   node test/run-all.js --skip=telegram # skip suites matching substrings
 *   node test/run-all.js --json          # machine-readable output
 *   node test/run-all.js --list          # list suites, run nothing
 *
 * Exit codes: 0 = all green, 1 = failures, 2 = timeouts (some may be
 * environmental — check FAIL/TIMEOUT list before panicking).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
// (pass 292) The order-independence seam: suites leak into the surfaces the
// whole sweep shares — models/state.json (the active-brain pointer) and the
// active brain's private/public trees. Suite N became suite N+1's
// environment (guests tripped agents.maxAgents on a roster the prior run
// left; teams-refresh ENOENTed on a state.json a pilot left pointing at
// another brain). restoreSlate before EVERY suite pins every suite to the
// same baseline whatever the order; the final restore leaves the workspace
// exactly as the sweep found it.
const slate = require('./slate');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(__dirname);
const PER_SUITE_TIMEOUT_MS = 120000;

const args = process.argv.slice(2);
const getOpt = (name) => {
    const hit = args.find((a) => a.startsWith('--' + name + '='));
    return hit ? hit.split('=').slice(1).join('=') : null;
};
const only = getOpt('only') ? getOpt('only').split(',') : null;
const skip = getOpt('skip') ? getOpt('skip').split(',') : [];
// (pass 293) Alphabetical range chunking: --from/--to bounds on the SORTED
// suite list (lexicographic on filenames, inclusive both ends). The
// substring --only filter classification is coarse for full-sweep runs
// (one-letter chunks fan out to almost every suite), and host command
// budgets need the 217-suite wall split; ranges keep every suite still
// running through the SAME harness (baseline restore before and after).
const fromOpt = getOpt('from');
const toOpt = getOpt('to');
const asJson = args.includes('--json');
const listOnly = args.includes('--list');

const suites = fs.readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !only || only.some((s) => f.includes(s)))
    .filter((f) => !skip.some((s) => f.includes(s)))
    .filter((f) => (!fromOpt || f >= fromOpt) && (!toOpt || f <= toOpt))
    .sort();

if (listOnly) {
    console.log(suites.join('\n'));
    console.error(`\n${suites.length} suites`);
    process.exit(0);
}

const results = [];
console.log(`\n🧪 VANT FULL-SUITE SWEEP — ${suites.length} suites\n`);

// Pristine baseline BEFORE the first suite runs — never inside the loop, so
// a suite's own pre-loop mutations are captured, not discarded.
let sweepSlate = null;
try { sweepSlate = slate.captureSlate(ROOT); } catch (e) {
    console.error(`⚠  slate capture failed (${e.message}) — sweeping UNGUARDED (order may matter)`);
}
function _guardRestore(via) {
    if (!sweepSlate) return;
    try { slate.restoreSlate(null, sweepSlate); } catch (e) {
        console.error(`⚠  slate restore (${via}) failed: ${e.message}`);
    }
}

for (const suite of suites) {
    const started = Date.now();
    let status = 'PASS';
    let detail = '';
    try {
        const out = execFileSync('node', [path.join(TEST_DIR, suite)], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: PER_SUITE_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, VANT_SWEEP: '1' }
        });
        // Suites self-report totals in their output; prefer the largest
        // "Failed: N" style line if present (some suites have internal
        // skip counts that don't affect exit code).
        const failLine = [...out.matchAll(/Failed:?\s+(\d+)/gi)].map((m) => parseInt(m[1], 10));
        const failed = failLine.length ? Math.max(...failLine) : 0;
        if (failed > 0) {
            status = 'FAIL';
            detail = `self-reported ${failed} failed (exit 0)`;
        }
    } catch (e) {
        if (e.killed || e.signal === 'SIGTERM') {
            status = 'TIMEOUT';
            detail = `${PER_SUITE_TIMEOUT_MS / 1000}s limit hit`;
        } else {
            status = 'FAIL';
            const out = ((e.stdout || '') + '\n' + (e.stderr || ''));
            const failLine = [...out.matchAll(/Failed:?\s+(\d+)/gi)].map((m) => parseInt(m[1], 10));
            const failed = failLine.length ? Math.max(...failLine) : '?';
            detail = `exit ${e.status} (${failed} failed)`;
            // Keep the first failure line for the summary
            const firstBad = out.split('\n').find((l) => /✗|FAIL|Error:/i.test(l));
            if (firstBad) detail += ' — ' + firstBad.trim().slice(0, 100);
        }
    }
    const ms = Date.now() - started;
    results.push({ suite, status, ms, detail });
    const icon = status === 'PASS' ? '✓' : status === 'TIMEOUT' ? '⏱' : '✗';
    console.log(`  ${icon} ${suite.padEnd(36)} ${(ms / 1000).toFixed(1)}s${detail ? '  ' + detail : ''}`);
    // NEXT SUITE STARTS FROM THE BASELINE — the suite's leak (especially a
    // failed/timeouted one) can never become the next suite's environment.
    _guardRestore(suite);
}

// Leave the workspace exactly as the sweep found it: brain pointer,
// active-brain trees reinstalled byte-exact, suite-created residue gone —
// and (pass 293) throwaway scratch brains the sweep minted swept too.
// Pre-existing brain dirs are never touched (scratch-manifest law).
_guardRestore('sweep-exit');
// (K4, 2026-10-25) The kill switch goes kernel-contracted: 'test-harness'
// registers (census of minted scratch brains + retire = autoreap), the
// census and the retire both journal through the kernel gate, and every
// retired id arrives LISTED in the census receipt (invariant 1 enforced
// structurally — the harness cannot delete what it never named). The bare
// janitor law stays one truth behind both doors (slate.listScratchMints).
let swept = { removed: [] };
try {
    const autoreap = require('./harness-autoreap');
    swept = autoreap.autoreap(sweepSlate);
} catch (e) {
    // Harness-autoreap import fault masks nothing: the janitor duty still runs.
    console.error(`⚠  kernel-contracted autoreap faulted (${e.message}) — bare janitor law runs unjournaled`);
    try { swept = slate.cleanupScratch(null, sweepSlate); } catch (e2) {
        console.error(`⚠  scratch cleanup failed: ${e2.message}`);
    }
}
slate.freeSlate(sweepSlate);
sweepSlate = null;
if (swept.removed.length > 0) {
    console.log(`\n  🧹 scratch cleanup: ${swept.removed.length} sweep-minted brain dir(s) removed:\n    ` + swept.removed.join('\n    '));
}

const passed = results.filter((r) => r.status === 'PASS');
const failed = results.filter((r) => r.status === 'FAIL');
const timeouts = results.filter((r) => r.status === 'TIMEOUT');
const totalMs = results.reduce((a, r) => a + r.ms, 0);

if (asJson) {
    console.log(JSON.stringify({
        total: results.length,
        passed: passed.length,
        failed: failed.length,
        timeouts: timeouts.length,
        totalMs,
        failures: failed.concat(timeouts).map((r) => ({ suite: r.suite, status: r.status, detail: r.detail }))
    }, null, 2));
} else {
    console.log('\n=== SWEEP SUMMARY ===');
    console.log(`  Suites:  ${results.length}`);
    console.log(`  Passed:  ${passed.length}`);
    console.log(`  Failed:  ${failed.length}${failed.length ? ' → ' + failed.map((r) => r.suite).join(', ') : ''}`);
    console.log(`  Timeouts: ${timeouts.length}${timeouts.length ? ' → ' + timeouts.map((r) => r.suite).join(', ') : ''}`);
    console.log(`  Wall:    ${(totalMs / 1000).toFixed(1)}s`);
    if (failed.length + timeouts.length > 0) {
        console.log('\n  Triage: fires land in labs/archives/audits/STABILITY.md; fix cheap, track structural.');
    }
}

process.exit(timeouts.length > 0 ? 2 : failed.length > 0 ? 1 : 0);
