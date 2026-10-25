'use strict';

/**
 * horcrux-census — K5 (labs/prd-kernel.md §7: "Horcrux inspect gains census
 * semantics — brains are entries, not mass"), the §3 wiring map's row 3.
 *
 * The mass-era sight: `vant horcrux inspect` could tell you a horcrux's
 * SIZE and timestamp (attest-adjacent), but never WHICH brains on a tree
 * are real versus hollow — and the pass-328 heap's carcass class re-bloomed
 * after the sweep killed it precisely because nothing weighed a brain's
 * ALIVENESS. K5 gives inspect the census: a brain dir becomes a NAMED,
 * KIND-carrying, dated ENTRY —
 *
 *   real ('brain')        — identity.md or any real content, OR the dir is
 *                           named by the models/state.json roster (a state-
 *                           named brain is never classified hollow: a
 *                           mid-write lineage member is alive, not debris);
 *   carcass ('brain-carcass') — dir exists but holds NO files beyond hidden
 *                           markers (the hollow shells the heap sweep kept
 *                           missing);
 *   hostile names         — never guessed into any listing (the K4 guard).
 *
 * The retire door is kernel-gated with the census receipt attached
 * (invariant 1 structurally — nothing dies that the census did not name),
 * and the census-anchored law is deliberately conservative on TWO fronts:
 *   1. it retires CARCASS DIRS ONLY;
 *   2. a dir holding a horcrux STONE is NEVER a carcass — a stone is the
 *      one disaster-recovery artifact this repo makes (the safeWrite
 *      contract exists precisely so the only copy survives), so a
 *      stone-bearing dir classifies real and its stones surface in the
 *      census as STALE-STONE CANDIDATES (stones whose brain's own content
 *      is gone) for the decommission run (§6c, K5a) to retire through the
 *      same door with the receipt — a stone-tide is an owner ceremony,
 *      never an automatic one. The retire door ships today; the CLI does
 *      not fire it (the inspect surface only GAINS the census — additive,
 *      never destructive by default).
 *
 * Every door re-registers (the probe seam may reset the registry between
 * runs — the K3/K4 duplicate-tolerance lesson) and computes from the LIVE
 * census. Kernel time only; wall clock never supplied.
 */

const path = require('path');
const fs = require('fs');
const kernel = require('./kernel');

const HORCRUX_WIRED_VERBS = ['census', 'retire'];
const MARKER_ALLOW = /^\.brain-anchor\.jsonl$/;   // hidden stego markers only
const NAME_SAFE = /^[A-Za-z0-9._-]+$/;

/** Registration (idempotent; duplicates ARE the registered state). */
function _register() {
    try {
        kernel.register({
            name: 'horcrux',
            scope: 'brain-level census (real vs carcass) + the stale-stone retire door (labs/prd-kernel.md §3 wiring map row 3)',
            verbs: {
                census: (detail) => _listBrainEntries(detail && detail.anchorRoot),
                retire: (detail) => _retireChunks(detail),
            },
        });
    } catch (e) {
        if (e && e.code === 'E_DUPLICATE_NAME') return; // already on the roster
        throw e;
    }
}

function _safeBrainNames(modelsSide) {
    try {
        return fs.readdirSync(modelsSide, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .filter((d) => NAME_SAFE.test(d.name))
            .map((d) => d.name)
            .sort();
    } catch (_e) {
        return [];
    }
}

/** The roster hint from models/state.json (a state-named brain is never
 * hollow — lineage membership is alive). Tolerant of any shape: unreadable
 * state.json returns the sentinel `unverifiable`, and the RETIRE door
 * refuses to fire while the living roster cannot be verified (no tide on
 * an unverifiable tree). */
function _rosterHint(anchorRoot) {
    const statePath = path.join(anchorRoot, 'models', 'state.json');
    try {
        const raw = fs.readFileSync(statePath, 'utf8');
        const parsed = JSON.parse(raw);
        const names = new Set();
        const collect = (v) => {
            if (typeof v === 'string' && v.trim()) names.add(v.trim());
            else if (Array.isArray(v)) v.forEach(collect);
        };
        collect(parsed && parsed.currentBrain);
        collect(parsed && parsed.stack);
        return { names, unverifiable: false };
    } catch (e) {
        // absent state.json = an honest empty roster (fresh tree);
        // PRESENT-but-unreadable = the tree cannot be verified right now.
        return { names: new Set(), unverifiable: fs.existsSync(statePath), parseError: e && e.name };
    }
}

function _dirHasRealContent(dir) {
    try {
        const names = fs.readdirSync(dir);
        const realFiles = names.filter((n) => !(n.startsWith('.') && MARKER_ALLOW.test(n)) && !n.startsWith('.'));
        if (realFiles.length > 0) return true;
        // only hidden markers (or nothing) → hollow
        return false;
    } catch (_e) {
        return false; // an unobservable dir: never classify it dead either
    }
}

function _stonesIn(dir) {
    // A stone (horcrux artifact) riding a dead brain: named in the receipt,
    // dies with its dir (the stale-stone law, census-anchored).
    try {
        return fs.readdirSync(dir).filter((n) => n.endsWith('.svg') || n.endsWith('.horcrux') || n.endsWith('.json'));
    } catch (_e) {
        return [];
    }
}

function _classify(anchorRoot) {
    const roster = _rosterHint(anchorRoot);
    const entries = [];
    for (const side of ['private', 'public']) {
        const modelsSide = path.join(anchorRoot, 'models', side);
        for (const brain of _safeBrainNames(modelsSide)) {
            if (roster.unverifiable) {
                // unverifiable tree: census still lists (census is a read),
                // but the entries carry no retirement eligibility.
                entries.push({ id: `${side}/${brain}`, kind: 'brain', abrupt: 'roster-unverifiable', stones: [] });
                continue;
            }
            const dir = path.join(modelsSide, brain);
            const real = _dirHasRealContent(dir) || roster.names.has(brain);
            const stones = _stonesIn(dir);
            entries.push({
                id: `${side}/${brain}`,
                kind: real ? 'brain' : 'brain-carcass',
                stones,
                staleStoneCandidate: stones.length > 0
                    && real
                    && !fs.existsSync(path.join(dir, 'identity.md')),   // brain content gone; only artifacts remain
            });
        }
    }
    return { entries, roster };
}

/** The census chunk (kernel calls it with the gate's detail). */
function _listBrainEntries(anchorRoot) {
    const root = anchorRoot && fs.existsSync(anchorRoot)
        ? anchorRoot
        : process.cwd();
    const { entries, roster } = _classify(root);
    const published = entries.map((e) => ({ id: e.id, at: kernel.time().seq, kind: e.kind }));
    if (roster.unverifiable) published.forEach((pe) => { pe.eligible = false; });
    return published;
}

/** The retire chunk (kernel calls it with the gate's detail): delete the
 * listed carcass dirs. Stones inside a carcass dir die with it — INCLUDING
 * stale stones — and every death (dir or stone) is sighted in the report. */
function _retireChunks(detail) {
    const root = detail.anchorRoot && fs.existsSync(detail.anchorRoot)
        ? detail.anchorRoot
        : process.cwd();
    const killed = { dirs: [], stones: [], skipped: [] };
    for (const id of detail.ids || []) {
        const slash = id.indexOf('/');
        if (slash <= 0) { killed.skipped.push(id); continue; } // malformed: never guess
        const side = id.slice(0, slash);
        const brain = id.slice(slash + 1);
        if (!['private', 'public'].includes(side) || !NAME_SAFE.test(brain)) { killed.skipped.push(id); continue; }
        const dir = path.join(root, 'models', side, brain);
        try {
            const stones = _stonesIn(dir);
            fs.rmSync(dir, { recursive: true, force: true });
            if (fs.existsSync(dir)) { killed.skipped.push(id); continue; } // never claim a death that did not happen
            killed.dirs.push(id);
            for (const s of stones) killed.stones.push(`${id}/${s}`);
        } catch (_e) {
            killed.skipped.push(id);
        }
    }
    return killed;
}

/** The inspect-facing census (the K5 add: brains are entries, not mass).
 * Runs through the gate so the journal carries the census; a foreign
 * kernel-less environment is impossible (the kernel is ours), but a RESET
 * self-heals via idempotent registration. */
function censusBrains(opts) {
    const anchorRoot = (opts && opts.anchorRoot) || process.cwd();
    _register();
    const out = kernel.gate('census', 'horcrux', { detail: { anchorRoot } });
    const byId = new Map(out.result.map((e) => [e.id, e]));
    // Stale-stone candidates (the disaster-recovery law's listing): a real
    // dir whose own brain content is gone but whose stones remain — the
    // decommission run's docket, never the automatic tide's.
    const fresh = _classify(fs.existsSync(anchorRoot) ? anchorRoot : process.cwd());
    const staleStoneCandidates = fresh.entries.filter((e) => e.staleStoneCandidate);
    return {
        ok: out.ok,
        real: out.result.filter((e) => e.kind === 'brain'),
        carcass: out.result.filter((e) => e.kind === 'brain-carcass'),
        all: out.result,
        byId,
        staleStoneCandidates: staleStoneCandidates.map((e) => ({ id: e.id, stones: e.stones })),
        time: out.time,
        journalSeq: out.time.seq,
    };
}

/** The stale-stone/carcass retire door (kernel-gated, receipt-attached).
 * hard-refuses to fire on an unverifiable roster, and the dryRun legs bill
 * the tide without crossing it. Its CALLSITE is the decommission run
 * (§6c/K5a) — the CLI does not fire it. */
function retireCarcass(opts) {
    const anchorRoot = (opts && opts.anchorRoot) || process.cwd();
    const dryRun = !!(opts && opts.dryRun);
    _register();
    const census = censusBrains({ anchorRoot });
    if (census.all.some((e) => e.eligible === false)) {
        return { ok: false, refused: 'roster-unverifiable', removed: [], juggled: census.all.map((e) => e.id) };
    }
    const receipt = census.carcass.map((e) => ({ id: e.id, at: census.time.seq, kind: 'brain-carcass' }));
    if (dryRun) {
        return { ok: true, dryRun: true, wouldRetire: receipt.map((e) => e.id), removed: [] };
    }
    if (receipt.length === 0) {
        // an empty tide crosses nothing (the K4 zero-mint lesson)
        return { ok: true, removed: [], stones: [], skipped: [] };
    }
    const ids = receipt.map((r) => r.id);
    let result;
    try {
        result = kernel.gate('retire', 'horcrux', {
            census: receipt,
            ids,
            reason: 'retire of stale stones: carcass brain dirs named by the census (labs/prd-kernel.md §3 wiring map row 3)',
            detail: { anchorRoot, ids },
        });
    } catch (e) {
        // self-heal once (a shrunken journal un-dates the receipt): the gate
        // refusal is honest; retry with a fresh census-dated receipt.
        try {
            _register();
            const fresh = censusBrains({ anchorRoot });
            if (fresh.all.some((x) => x.eligible === false)) {
                return { ok: false, refused: 'roster-unverifiable', removed: [] };
            }
            const rebased = fresh.carcass.map((n) => ({ id: n.id, at: fresh.time.seq, kind: 'brain-carcass' }));
            if (rebased.length === 0) return { ok: true, removed: [], stones: [], skipped: [] };
            result = kernel.gate('retire', 'horcrux', {
                census: rebased,
                ids: rebased.map((r) => r.id),
                reason: 'retire of stale stones: carcass brain dirs named by the census (labs/prd-kernel.md §3 wiring map row 3)',
                detail: { anchorRoot, ids: rebased.map((r) => r.id) },
            });
        } catch (e2) {
            return { ok: false, refused: (e2 && e2.code) || (e && e.code) || null, removed: [] };
        }
    }
    return {
        ok: true,
        removed: (result.result && result.result.dirs) || [],
        stones: (result.result && result.result.stones) || [],
        skipped: (result.result && result.result.skipped) || [],
        journalSeq: result.time.seq,
    };
}

module.exports = {
    HORCRUX_WIRED_VERBS,
    censusBrains,
    retireCarcass,

    /** TEST-ONLY unwind (scratch posture): drops the consumer + journal.
     * The pins use it for row isolation; the CLI never does. */
    _unwind() {
        // Many callers require './kernel' directly and call kernel._unwind();
        // this seam exists so the pins' isolation lives in ONE module shape
        // (K3/K4 pins call the kernel seam directly — keep parity here).
        kernel._unwind();
    },
};
