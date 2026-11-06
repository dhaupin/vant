'use strict';

/**
 * Per-suite scratch-brain lifecycle (pass 378).
 *
 * THE GAP: run-all's sweep-exit autoreap (tests/harness-autoreap.js, K4)
 * only reaps brains minted DURING one sweep, and only when the sweep runner
 * itself is used. A suite run directly (`node tests/x.test.js`), a suite that
 * hardcodes a fixed scratch name (qc-*, p9x-*, gstest, …), or a killed sweep
 * left its throwaway brain under models/private|public forever — the residue
 * the pass-328 heap sweep kept finding. The sweep-level janitor is the net;
 * this module is the suite's own duty: mint → point VANT_BRAIN at it →
 * remove exactly that brain on process exit.
 *
 * THE LAW:
 *   - only a name the suite DECLARES as scratch is ever deleted;
 *   - simple dir names only (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, no
 *     separators, no dot-dirs) — hostile names are refused, never guessed;
 *   - real brains (vant, axolotl) are refused outright;
 *   - the reap is best-effort and silent: a delete that fails leaves residue
 *     the sweep's census will name next time, and must never mask the
 *     suite's own result;
 *   - both sides are swept (private first — suites may mint either).
 *
 * NOT handled here: SIGKILL/timeout deaths (no exit hook can run). That
 * residue is exactly what tests/slate.js + harness-autoreap.js sweep at the
 * next full run.
 *
 * Usage:
 *   const SCRATCH_BRAIN = require('./scratch-brain').scratchBrain(
 *       'ag-test-' + Date.now().toString(36));
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIDES = ['private', 'public'];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REAL_BRAINS = new Set(['vant', 'axolotl']);

function _validate(name) {
    if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
        throw new Error(`scratch-brain: refusing unsafe scratch name ${JSON.stringify(name)}`);
    }
    if (name === '.' || name === '..' || name.startsWith('.')) {
        throw new Error(`scratch-brain: refusing dot-dir scratch name ${JSON.stringify(name)}`);
    }
    if (REAL_BRAINS.has(name)) {
        throw new Error(`scratch-brain: refusing to treat real brain '${name}' as scratch`);
    }
    return name;
}

/** Remove exactly `name` from models/private and models/public. Idempotent,
 * best-effort, never throws (safe on the process-exit path). Returns the
 * side-qualified ids it actually removed. */
function reapScratchBrain(name) {
    let safe;
    try { safe = _validate(name); } catch (_e) { return []; }
    const removed = [];
    for (const side of SIDES) {
        const dir = path.join(ROOT, 'models', side, safe);
        try {
            if (!fs.existsSync(dir)) continue;
            fs.rmSync(dir, { recursive: true, force: true });
            removed.push(`${side}/${safe}`);
        } catch (_e) { /* leave it — the sweep census will find it again */ }
    }
    return removed;
}

const _armed = new Set();

/** Declare `name` as this suite's throwaway brain: point VANT_BRAIN at it and
 * arm the exit reap. Returns the name so call sites read as before. */
function scratchBrain(name) {
    _validate(name);
    process.env.VANT_BRAIN = name;
    if (!_armed.has(name)) {
        _armed.add(name);
        process.once('exit', () => { reapScratchBrain(name); });
    }
    return name;
}

module.exports = { scratchBrain, reapScratchBrain };
