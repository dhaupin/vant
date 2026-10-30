'use strict';

/**
 * pipeline-kernel-witness — the K7-row witness for the pipeline surface
 * (labs/prd-kernel.md §3 wiring map row 6: "lib/pipeline.js registers as
 * 'pipeline' with census of pending/committed steps; attest of outcomes").
 *
 * Lives in its own module so the witness wiring never leaks into the
 * pipeline's own logic (adoption is registration + verb wiring, never a
 * rewrite), and so the pins can load it without exercising the middleware.
 *
 * The census chunk enumerates the pipeline's DECLARED step surface — the
 * mode chains (each mode's ordered middleware steps) as entries
 * { id: 'mode:<mode>:<index>:<step>', kind: 'pipeline-step' } — kernel-dated
 * at the gate (journal positions, never wall clocks). The attest chunk
 * witnesses a stack outcome onto the ledger, self-basing with a kernel-
 * gated census (invariant 2): a dated census entry behind every outcome.
 *
 * Clerk-not-judge (§2 Q8): every kernel refusal journals itself in the
 * kernel's ledger and surfaces on stderr — the pipeline's own verdicts are
 * never touched. Externally reset registries (the probe seam) self-heal via
 * idempotent registration.
 */

const path = require('path');
const kernel = require('./kernel');

const PIPELINE_WIRED_VERBS = ['census', 'attest'];

function _register() {
    try {
        kernel.register({
            name: 'pipeline',
            scope: 'middleware chain (labs/prd-kernel.md §3 wiring map row 6)',
            verbs: {
                census: (detail) => {
                    let chains = null;
                    try {
                        ({ MODE_CHAINS: chains } = require('./pipeline'));
                    } catch (_e) { chains = null; }
                    const entries = [];
                    const seq = kernel.time().seq;   // kernel time at the census gate
                    for (const [mode, steps] of Object.entries(chains || {})) {
                        if (!Array.isArray(steps)) continue;
                        steps.forEach((step, i) => {
                            entries.push({ id: `mode:${mode}:${i}:${typeof step === 'string' ? step : (step && step.name) || 'anon'}`, at: seq, kind: 'pipeline-step' });
                        });
                    }
                    return entries;
                },
                attest: () => ({ witnessed: true }),
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return;   // already on the roster
        throw e;
    }
}

/** The kernel-gated census of the declared step surface. */
function kernelCensusSteps() {
    _register();
    const out = kernel.gate('census', 'pipeline', {});
    return {
        ok: out.ok,
        steps: out.result,
        time: out.time,
        byMode: out.result.reduce((acc, e) => {
            const mode = String(e.id).split(':')[1];
            (acc[mode] = acc[mode] || []).push(e.id);
            return acc;
        }, {}),
    };
}

/** attest of outcomes: called by runStack's completion tail (best-effort).
 * Self-basements with a kernel-gated census when the basis is missing or
 * stale, swallows everything, and returns a small witness receipt for
 * whoever asks. */
function kernelWitnessOutcome(operation, results) {
    try {
        _register();
        let basis = _basis;
        const len = kernel.journal().length;
        if (basis === null || basis < 1 || basis > len) {
            basis = _basis = kernel.gate('census', 'pipeline', {}).time.seq;
        }
        const outcome = Array.isArray(results)
            ? results.map((r) => (r && r.success) === true ? 'ok' : 'refused').join('+')
            : 'unknown';
        const out = kernel.gate('attest', 'pipeline', {
            claim: `outcome:${String(operation || 'unnamed-run').slice(0, 80)}:${outcome}`,
            basis: { at: basis },
            detail: { operation: String(operation || ''), outcome, count: Array.isArray(results) ? results.length : 0 },
        });
        return { witnessed: true, seq: out.time.seq };
    } catch (e) {
        // Fabricate a failure tip without blocking the run: the kernel has
        // journaled the refusal itself; self-heal on a reset.
        if (e && e.code === 'E_UNKNOWN_CONSUMER') _basis = null;
        return { witnessed: false, code: (e && e.code) || null };
    }
}

let _basis = null;

module.exports = {
    kernelCensusSteps,
    kernelWitnessOutcome,
    PIPELINE_WIRED_VERBS,
};
