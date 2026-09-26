'use strict';

/**
 * Repo-root anchoring (pass 23).
 *
 * The dispatcher intentionally spawns routed subcommands in the CALLER'S cwd
 * (brains live in the user's project — see bin/vant.js). But "where is the
 * INSTALL" and "where is the USER'S PROJECT" are different questions, and
 * several libs conflate them by inferring the install root from __dirname or
 * cwd depending on which file they happen to sit in.
 *
 * The dispatcher now exports VANT_REPO_ROOT (the install root) into every
 * routed command's environment. lib code that needs the INSTALL tree —
 * templates, boot dirs, horcrux targets, package.json — resolves it through
 * this module instead of guessing:
 *
 *   const root = require('./anchor').getRepoRoot();
 *
 * Resolution order:
 *   1. VANT_REPO_ROOT env (set by the dispatcher; may also be set by hosts
 *      embedding vant from a non-standard location)
 *   2. This module's own install tree (works for direct lib consumers)
 *
 * NOTE: this is deliberately NOT used for brain content paths — those stay
 * cwd-anchored BY DESIGN (getBrainPath etc.) so each project keeps its own
 * models/ tree.
 */

const path = require('path');

function getRepoRoot() {
    if (process.env.VANT_REPO_ROOT) {
        return path.resolve(process.env.VANT_REPO_ROOT);
    }
    return path.resolve(__dirname, '..');
}

module.exports = { getRepoRoot };
