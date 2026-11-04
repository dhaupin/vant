'use strict';

/**
 * harness.autoreap — K4 (labs/prd-kernel.md §7, the pass-328 kill switch
 * becoming a contract).
 *
 * The leak: the test harness MINTS scratch brains per run (livefire-*,
 * p9x-*, one-shot temp brains suites create) and for a long time NEVER
 * retired them — the pass-328 heap sweep had to hunt the residue by hand,
 * and the sweep's own world kept bloating. Pass 293 gave the sweep a
 * janitor (slate.cleanupScratch); K4 makes that kill switch a
 * KERNEL-CONTRACTED surface:
 *
 *   - registers as 'test-harness' (the §3 wiring map's row 2), verbs wired
 *     first: census of minted scratch brains; retire = autoreap. attest +
 *     succeed stay UNWIRED — the census-visible gap (invariant 3) names
 *     the partial adoption until a row needs them.
 *   - the census runs THROUGH the kernel gate: the sweep's janitor bill
 *     and its kernel census are the same truth (slate.listScratchMints is
 *     shared with the bare janitor law — one law, two doors).
 *   - the retire runs THROUGH the kernel gate with the census receipt
 *     attached: invariant 1 enforces itself — the harness cannot delete a
 *     thing it did not census, and every retired id is on the journal.
 *   - clerk-not-judge: a kernel refusal journals itself and surfaces on
 *     stderr; the sweep's exit code is never mutated by bookkeeping.
 *
 * Deliberately NOT scheduled beyond the sweep exit (§7: shape, not
 * schedule). The kernel probe seam may reset the registry between rows;
 * every door re-registers (idempotent) before acting.
 */

const path = require('path');
const fs = require('fs');

// Wiring from OUTSIDE the portable core (the one-way boundary the spec
// demands): the kernel requires nothing of the harness, the harness
// requires the kernel.
const kernel = require(path.join(__dirname, '..', 'lib', 'kernel.js'));
const slate = require('./slate');

const AUTOREAP_VERBS_WIRED = ['census', 'retire'];
const AUTOREAP_REASON = 'autoreap: pass-328 kill switch — harness-owned scratch mints retired on suite exit';

/** Registration (idempotent — heals probe resets). A coded duplicate
 * refusal means the consumer is already on the roster, which IS the
 * registered state (the K3 lesson: tolerate the duplicate, rethrow the
 * rest). */
function _register() {
    try {
        kernel.register({
            name: 'test-harness',
            scope: 'sweep scratch-brain mints (the pass-328 kill switch, labs/prd-kernel.md §3 wiring map row 2)',
            verbs: {
                census: (detail) => _listMints(detail),
                retire: (detail) => _reapDirs(detail),
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return; // already-on-roster is the registered state
        throw e;
    }
}

/** The census chunk: enumerate the sweep-minted scratch brains (the shared
 * manifest-diff law). Returns [{ id: '<side>/<name>', kind: 'scratch-brain' }]
 * — the journaling layer at the gate dates every entry (kernel time, never
 * a wall clock). */
function _listMints(_detail) {
    return slate.listScratchMints(_detail && _detail.slate).map((m) => ({
        id: `${m.side}/${m.name}`,
        kind: 'scratch-brain',
    }));
}

/** The retire chunk: delete exactly the accepted mint dirs. Returns the
 * removal report for the janitor bill; a failed delete stays out of the
 * bill (honest absence — it is still on disk, the census will find it
 * next sweep). */
function _reapDirs(detail) {
    const root = detail.slate.root;
    const removed = [];
    for (const id of detail.ids || []) {
        const slash = id.indexOf('/');
        if (slash <= 0) continue; // malformed id: never guess where it lives
        const side = id.slice(0, slash);
        const name = id.slice(slash + 1);
        if (!['private', 'public'].includes(side) || !/^[A-Za-z0-9._-]+$/.test(name)) continue;
        const dir = path.join(root, 'models', side, name);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            removed.push(id);
        } catch (_e) { /* leave it — the next sweep's census will find it again */ }
    }
    return { removed };
}

/** Census through the gate (journals a verb entry naming the mints):
 * the inspectable half of the kill switch — CI can read the bill before
 * anything dies. */
function censusMints(slateObj) {
    _register();
    const out = kernel.gate('census', 'test-harness', { detail: { slate: slateObj } });
    return { ok: out.ok, mints: out.result, time: out.time };
}

/** THE KILL SWITCH: census → retire, both kernel-gated, receipt attached.
 * `dryRun` censuses without retiring (the bill without the tide). Returns
 * the janitor's bill `{ removed, censused, dryRun }`; a kernel that cannot
 * be reached falls back to the bare janitor law with a loud stderr line —
 * bookkeeping never holds the sweep hostage. */
function autoreap(slateObj, opts) {
    const dryRun = opts === true || (opts && opts.dryRun === true);
    try {
        _register();
    } catch (e) {
        return _fallback(slateObj, dryRun, e);
    }

    // Census: what died must be named BEFORE the tide (invariant 1).
    let accepted = null;
    try {
        accepted = censusMints(slateObj);
    } catch (e) {
        return _fallback(slateObj, dryRun, e);
    }
    const receipt = accepted.mints.map((m) => ({ id: String(m.id), at: accepted.time.seq, kind: 'scratch-brain' }));
    if (dryRun) {
        return { removed: [], censused: receipt.map((r) => r.id), dryRun: true };
    }
    if (receipt.length === 0) {
        // An empty tide crosses nothing — retiring zero is not a retire, and
        // the census gate ALREADY refused retiring-without-census would fire.
        // The zero-mint sweep exits quietly (the census verb entry above is
        // the honest record that the bill was read and was empty).
        return { removed: [], censused: [], dryRun: false };
    }

    const ids = receipt.map((r) => r.id);
    // Retire through the gate: the gate verifies every id is LISTED in the
    // census receipt (invariant 1) and the reason is present, journals the
    // verb entry, THEN the chunk deletes. A retired dir that was never on
    // the census is structurally impossible — not just forbidden. The ids
    // ride IN the detail: the chunk receives only payload.detail.
    let result = null;
    try {
        result = kernel.gate('retire', 'test-harness', {
            census: receipt,
            ids,
            reason: AUTOREAP_REASON,
            detail: { slate: slateObj, ids },
        });
        return { removed: (result.result && result.result.removed) || [], censused: receipt.map((r) => r.id), dryRun: false, journalSeq: result.time.seq };
    } catch (e) {
        // A kernel-gate refusal here means our own choreography drifted
        // (a shrunken journal can un-date the receipt) — self-heal once:
        // re-census re-dates, then retire again.
        try {
            _register();
            const reCensus = censusMints(slateObj);
            const rebased = reCensus.mints.map((m) => ({ id: String(m.id), at: reCensus.time.seq, kind: 'scratch-brain' }));
            result = kernel.gate('retire', 'test-harness', {
                census: rebased,
                ids: rebased.map((r) => r.id),
                reason: AUTOREAP_REASON,
                detail: { slate: slateObj, ids: rebased.map((r) => r.id) },
            });
            return { removed: (result.result && result.result.removed) || [], censused: rebased.map((r) => r.id), dryRun: false, journalSeq: result.time.seq };
        } catch (e2) {
            return _fallback(slateObj, dryRun, e2);
        }
    }
}

/** The honest fallback path: the sweep cannot exit without cleanup, so a
 * kernel fault degrades to the bare janitor law (same truth, no journal)
 * with the refusal visible on stderr — fail-closed is never fail-silent,
 * and cleanup is the harness's OWN duty regardless of bookkeeping health. */
function _fallback(slateObj, dryRun, err) {
    process.stderr.write(`[autoreap] kernel witness refused (${err && err.code ? err.code : 'no-code'}: ${String((err && err.message) || err).slice(0, 120)}) — falling back to the bare janitor law (unjournaled)\n`);
    if (dryRun) return { removed: [], censused: [], dryRun: true, fallback: true };
    const r = slate.cleanupScratch(null, slateObj);
    return { removed: r.removed || [], censused: [], dryRun: false, fallback: true };
}

module.exports = { autoreap, censusMints, AUTOREAP_REASON, AUTOREAP_VERBS_WIRED };
