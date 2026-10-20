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
        activePublicPresent: false
    };

    // models/state.json — the shared current-brain pointer.
    const stateFile = path.join(root, 'models', 'state.json');
    const stateSt = _statSafe(stateFile);
    if (stateSt && !stateSt.isDirectory()) {
        slate.statePresent = true;
        fs.copyFileSync(stateFile, path.join(base, 'state.json'));
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
    if (slate.statePresent) {
        if (stateSt0 && (stateSt0.isSymbolicLink() || stateSt0.isDirectory())) {
            try { fs.rmSync(stateFile, { force: true }); } catch (_e) { /* best effort; copy below decides */ }
        }
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.copyFileSync(path.join(slate.base, 'state.json'), stateFile);
        restored++;
    } else if (stateSt0) {
        try { fs.rmSync(stateFile, { force: true }); removed++; } catch (_e) { /* nothing to do */ }
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

function freeSlate(slate) {
    if (slate && slate.base) {
        try { fs.rmSync(slate.base, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
    }
}

module.exports = { captureSlate, restoreSlate, freeSlate };
