'use strict';

/**
 * Shared ACTIVE-BRAIN seam for test pins (pass 287, the QC-round sweep).
 *
 * The libs resolve brain-scoped stores through state-store's path-active
 * resolver — VANT_BRAIN env > models/state.json (currentBrain, or the
 * stack head) > 'vant' (state-store.js `currentBrain()`, pass 88's law).
 * A cluster of test pins instead hardcoded 'models/private/vant/…' or
 * called the bare brain.getCurrentBrain() (the exact stale resolver pass
 * 88 documented as ignoring VANT_BRAIN), so any env-scoped run (scratch
 * brains in QC sweeps, multi-runtime hosts) level-failed while the lib
 * wrote the right file. Use this for every pinned-on-disk path that
 * mirrors a lib store.
 *
 * Resolution order is byte-identical to state-store.currentBrain():
 *
 *   1. VANT_BRAIN env (segment-validated by the caller's own regex here —
 *      a hostile value must not steer the pin path either)
 *   2. models/state.json currentBrain, else the stack head
 *   3. 'vant'
 */
const fs = require('fs');
const path = require('path');

function resolveActiveBrain(rootDir) {
    const root = rootDir || process.cwd();
    if (process.env.VANT_BRAIN && /^[A-Za-z0-9._-]+$/.test(process.env.VANT_BRAIN)) {
        return process.env.VANT_BRAIN;
    }
    try {
        const state = JSON.parse(fs.readFileSync(path.join(root, 'models', 'state.json'), 'utf8'));
        const pick = typeof state.currentBrain === 'string' && state.currentBrain
            ? state.currentBrain
            : (Array.isArray(state.stack) && state.stack[0] ? state.stack[0] : null);
        if (pick && /^[A-Za-z0-9._-]+$/.test(pick)) return pick;
    } catch (_e) { /* fall through: no state.json yet */ }
    return 'vant';
}

module.exports = { resolveActiveBrain };
