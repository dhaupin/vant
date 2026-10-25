'use strict';

/**
 * Shared TEST-SLATE seam (pass 292 — closes the live-fire sweep-order gap).
 *
 * THE GAP (live-fire round 2, 2026-10-20): suites leak into SURFACES the
 * whole sweep shares — models/state.json (the active-brain pointer) and the
 * active brain's private/public trees (orgchart rosters, habitat state,
 * per-brain config). Suite N's residue becomes suite N+1's environment, so
 * sweep results depend on ordering (guests tripped agents.maxAgents on a
 * roster the previous run left behind; teams-refresh ENOENTed on a
 * state.json left pointing at a pilot brain). Not a product bug: the libs
 * are cwd-anchored BY DESIGN (lib/anchor.js) — the leak is a HARNESS issue,
 * and `vant health --sweep` / `vant migrate` don't (and shouldn't) touch
 * test residue.
 *
 * THE LAW: a suite must start from the same baseline no matter what ran
 * before it, and a sweep must leave the workspace exactly as it found it.
 * captureSlate(root) mirrors the shared surfaces into a temp dir;
 * restoreSlate(root, slate) reinstalls them byte-for-byte and deletes
 * anything a suite created under them. run-all.js restores before EVERY
 * suite (order-independence) and once more after the loop (pristine exit).
 *
 * Scope is deliberately narrow — ONLY the shared surfaces:
 *   - models/state.json
 *   - models/private/<active-brain>/   (resolved through test/active-brain,
 *                                       the same path-active seam the libs use)
 *   - models/public/<active-brain>/
 * Throwaway scratch brains (gstest, livefire-*, ag-test-…, p9x-*) are NOT
 * touched: suites own their scratch-brain lifecycle (teams/guests already
 * wipe their own throwaway stores per pass-287 law).
 *
 * Standalone runs (`node test/x.test.js` outside the sweep) still share the
 * workspace state — wire slate into a suite if it mutates the surfaces; the
 * harness guarantee is the runner's to give.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveActiveBrain } = require('./active-brain');

function _statSafe(p) {
    try { return fs.lstatSync(p); } catch (_e) { return null; }
}

function captureSlate(rootDir) {
    const root = rootDir || process.cwd();
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-slate-'));
    const slate = {
        root,
        base,
        active: resolveActiveBrain(root),
        statePresent: false,
        activePrivatePresent: false,
        activePublicPresent: false,
        // (pass 293) Sweep-exit scratch-brain janitor input: the brain-dir
        // manifests BEFORE any suite runs. Cleanup removes only dirs that
        // appeared DURING the sweep; anything that existed pre-sweep
        // (gstest, livefire reruns the user kept, real brains) is never
        // touched by a test run.
        privateManifest: _listBrainDirs(path.join(root, 'models', 'private')),
        publicManifest: _listBrainDirs(path.join(root, 'models', 'public'))
    };

    // models/state.json — the shared current-brain pointer. A SYMLINK in
    // this seat (the storage-layer replant law) is never followed into a
    // write: capture records the LINK TARGET, restore recreates the link —
    // capture follows content only for a plain file seat.
    const stateFile = path.join(root, 'models', 'state.json');
    const stateSt = _statSafe(stateFile);
    if (stateSt && stateSt.isSymbolicLink()) {
        slate.stateIsSymlink = true;
        slate.statePresent = false;
        slate.stateLinkTarget = fs.readlinkSync(stateFile);
    } else if (stateSt && !stateSt.isDirectory()) {
        slate.stateIsSymlink = false;
        slate.stateLinkTarget = null;
        slate.statePresent = true;
        fs.copyFileSync(stateFile, path.join(base, 'state.json'));
    } else {
        slate.stateIsSymlink = false;
        slate.stateLinkTarget = null;
        slate.statePresent = false;
    }

    // Active brain trees (private first, then public — a brain can live in
    // either; capture whichever exists right now).
    const privateDir = path.join(root, 'models', 'private', slate.active);
    const privateSt = _statSafe(privateDir);
    if (privateSt && privateSt.isDirectory()) slate.activePrivatePresent = true;
    if (slate.activePrivatePresent) fs.cpSync(privateDir, path.join(base, 'active-private'), { recursive: true });

    const publicDir = path.join(root, 'models', 'public', slate.active);
    if (_statSafe(publicDir) && _statSafe(publicDir).isDirectory()) {
        slate.activePublicPresent = true;
        fs.cpSync(publicDir, path.join(base, 'active-public'), { recursive: true });
    }

    return slate;
}

function restoreSlate(rootArg, slate) {
    if (!slate || !slate.root || !slate.base) {
        throw new Error('restoreSlate: a captured slate from captureSlate(root) is required');
    }
    const root = slate.root;
    let restored = 0;
    let removed = 0;

    // state.json — reinstall the captured file; delete a suite-created one
    // when the baseline had none. A symlink in the target seat is REPLANTED
    // (the storage-layer law: never follow a planted symlink into a write).
    const stateFile = path.join(root, 'models', 'state.json');
    const stateSt0 = _statSafe(stateFile);
    // Whatever the baseline shape, the target seat is cleared first — a
    // suite that planted a symlink (or a file) where a link/file lived
    // never survives restore.
    if (stateSt0) {
        try { fs.rmSync(stateFile, { force: true }); } catch (_e) { /* best effort; shape reinstalled below */ }
    }
    if (slate.stateIsSymlink && slate.stateLinkTarget) {
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.symlinkSync(slate.stateLinkTarget, stateFile);
        restored++;
    } else if (slate.statePresent) {
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.copyFileSync(path.join(slate.base, 'state.json'), stateFile);
        restored++;
    } else if (stateSt0) {
        removed++; // baseline had none: a suite-created pointer can't stay
    }

    // Active brain trees — full reinstall: the baseline tree replaces
    // whatever the suite left (suite-created FILES vanish because the whole
    // dir is rebuilt; files the baseline DID have come back byte-exact).
    const privateDir = path.join(root, 'models', 'private', slate.active);
    try { fs.rmSync(privateDir, { recursive: true, force: true }); } catch (_e) { /* nothing to remove */ }
    if (slate.activePrivatePresent) {
        fs.mkdirSync(path.dirname(privateDir), { recursive: true });
        fs.cpSync(path.join(slate.base, 'active-private'), privateDir, { recursive: true });
        restored++;
    }

    const publicDir = path.join(root, 'models', 'public', slate.active);
    try { fs.rmSync(publicDir, { recursive: true, force: true }); } catch (_e) { /* nothing to remove */ }
    if (slate.activePublicPresent) {
        fs.mkdirSync(path.dirname(publicDir), { recursive: true });
        fs.cpSync(path.join(slate.base, 'active-public'), publicDir, { recursive: true });
        restored++;
    }

    return { restored, removed, active: slate.active };
}

function _listBrainDirs(modelsSide) {
    try {
        return fs.readdirSync(modelsSide, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
    } catch (_e) { return []; }
}

/**
 * (K4, 2026-10-25) The census-only view of the scratch-manifest law: which
 * brain dirs appeared DURING the sweep (absent from the capture-time
 * manifest) and are therefore the harness's own mints. One truth for two
 * consumers — the bare janitor (cleanupScratch) and the kernel-contracted
 * kill switch (test/harness-autoreap.js) — so the sweep's janitor bill and
 * its kernel-census never fork. Returns [{ side, name }] in the same shape
 * both consumers use.
 */
function listScratchMints(slate) {
    if (!slate || !slate.root) {
        throw new Error('listScratchMints: a captured slate from captureSlate(root) is required');
    }
    const root = slate.root;
    const keptPre = new Set(slate.privateManifest);
    const keptPub = new Set(slate.publicManifest);
    const mints = [];
    const survey = (side, kept) => {
        const dir = path.join(root, 'models', side);
        for (const name of _listBrainDirs(dir)) {
            if (kept.has(name)) continue;   // pre-sweep: never a mint
            if (!/^[A-Za-z0-9._-]+$/.test(name)) continue; // weird names: never guess
            mints.push({ side, name });
        }
    };
    survey('private', keptPre);
    survey('public', keptPub);
    return mints;
}

/**
 * (pass 293) Sweep-exit scratch-brain cleanup. Removes ONLY brain dirs that
 * appeared under models/private|public DURING the sweep (absent from the
 * capture-time manifest) — sweep-created throwaway scratch (livefire-*,
 * p9x-*, one-shot temp brains suites mint). Never touches a dir that
 * existed pre-sweep, and never touches the active brain (it is baseline-
 * restored above regardless — cleanup runs AFTER restoreSlate at exit).
 * Returns what it removed so the runner can print the janitor's bill.
 * (K4) The removal law itself lives in listScratchMints now — this wrapper
 * deletes exactly what the census names (same truth, shared with the
 * kernel-contracted autoreap door).
 */
function cleanupScratch(rootArg, slate) {
    if (!slate || !slate.root) {
        throw new Error('cleanupScratch: a captured slate from captureSlate(root) is required');
    }
    const root = slate.root;
    const removed = [];
    for (const m of listScratchMints(slate)) {
        const dir = path.join(root, 'models', m.side);
        try { fs.rmSync(path.join(dir, m.name), { recursive: true, force: true }); removed.push(m.side + '/' + m.name); } catch (_e) { /* leave it */ }
    }
    return { removed };
}

function freeSlate(slate) {
    if (slate && slate.base) {
        try { fs.rmSync(slate.base, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
    }
}

module.exports = { captureSlate, restoreSlate, listScratchMints, cleanupScratch, freeSlate };
