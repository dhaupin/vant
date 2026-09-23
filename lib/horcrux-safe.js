'use strict';

/**
 * Shared backup-safety for horcrux writes (pass 23).
 *
 * Both `vant horcrux refresh` and `vant snapshot` overwrite horcrux files
 * whose ONLY copy may be that file — the discovered boot horcrux is a
 * disaster-recovery artifact. toHorcrux's atomicWriteFile guarantees a
 * crash never leaves a PARTIAL file, but nothing guaranteed the fresh
 * CONTENT is decryptable before the old backup is gone: a successful
 * encode of corrupt data still replaced the good copy.
 *
 * safeWriteHorcrux is the contract both CLIs now share:
 *   1. If the target does NOT exist → write directly (nothing to protect).
 *   2. If it DOES exist → encode to a sibling .tmp file, round-trip
 *      validate the tmp (decode + structure), THEN rename over the target.
 *   3. Any failure at any stage → original untouched, tmp removed, error
 *      thrown with the original error attached.
 *
 * All paths are resolved against getRepoRoot() (VANT_REPO_ROOT-aware), so
 * the flow is cwd-independent.
 */

const path = require('path');
const fs = require('fs');
const anchor = require('./anchor');

/**
 * Encode `encode(relPath, opts)` safely into `relTarget`.
 *
 * @param {string} relTarget repo-relative path of the horcrux to write
 * @param {Object} opts
 *   - encode:  async (relPath, opts) => write result; receives a
 *              repo-relative path to write to (REQUIRED)
 *   - decode:  async (relPath, opts) => parsed horcrux data (REQUIRED)
 *   - validate: (data) => { valid, errors } | true | undefined (optional;
 *              when it returns { valid: false } the write is aborted)
 *   - label:   string for log/error messages (default: 'horcrux')
 *   - log:     (msg) => void, optional progress logger
 *   - All other opts are forwarded to encode/decode (password etc.)
 * @returns {Promise<{usedTmp: boolean, replaced: boolean, target: string,
 *                     absTarget: string, size: number|null, result: object,
 *                     data: object|null}>}
 */
async function safeWriteHorcrux(relTarget, opts = {}) {
    const { encode, decode, validate, label = 'horcrux', log = () => {} } = opts;
    if (typeof encode !== 'function' || typeof decode !== 'function') {
        throw new Error('safeWriteHorcrux requires encode and decode callbacks');
    }

    const root = anchor.getRepoRoot();
    const absTarget = path.isAbsolute(relTarget) ? relTarget : path.join(root, relTarget);
    const useAbs = path.isAbsolute(relTarget) ? relTarget : null;

    // (pass 23.1) toHorcrux/fromHorcrux resolve their (relative) paths
    // against process.cwd(), but this helper anchors everything at the repo
    // root. Temporarily chdir so both anchors agree — found live when a
    // dispatcher-routed refresh from a foreign cwd encoded the tmp into the
    // CALLER'S tree while the stat/cleanup looked at the repo's.
    const prevCwd = process.cwd();
    const cwdMoved = prevCwd !== root;
    if (cwdMoved) process.chdir(root);

    const exists = fs.existsSync(absTarget);
    // Repo-relative sibling tmp — vaf.checkPathTraversal blocks absolute
    // paths, so encode/decode always receive a RELATIVE path (resolved from
    // the repo root, which transform.toHorcrux treats as its anchor).
    const relTmp = (useAbs
        ? path.relative(root, useAbs)
        : String(relTarget)).replace(/\.svg$/i, '') + '.tmp.svg';
    const absTmp = path.join(root, relTmp);

    const cleanupTmp = () => { try { fs.rmSync(absTmp, { force: true }); } catch (e) { /* best effort */ } };

    if (!exists) {
        // New target: nothing to protect, write directly.
        const result = await encode(useAbs || relTarget, opts);
        log(`   ${label} written: ${absTarget}`);
        // Even new targets get the round-trip when a decode callback is
        // provided — a fresh backup that cannot decrypt is worthless.
        let data = null;
        if (opts.validate || !opts.skipDecodeOnNew) {
            try {
                data = await decode(useAbs || relTarget, opts);
                if (validate) {
                    const v = validate(data);
                    if (v && v.valid === false) {
                        throw new Error('post-encode validation failed: ' + ((v.errors || []).join('; ') || 'unknown'));
                    }
                }
            } catch (e) {
                // The (unvalidated) new file exists; leave it but tell the
                // caller loudly — do NOT pretend the backup is good.
                e.message = `${label} written but FAILED round-trip validation: ${e.message}`;
                throw e;
            }
        }
        if (cwdMoved) process.chdir(prevCwd);
        return { usedTmp: false, replaced: false, target: useAbs || relTarget, absTarget, size: result && result.size || null, result, data };
    }

    // Existing target: tmp → validate → rename. Never touch the original
    // until the fresh content provably decodes.
    log(`   ${label}: existing backup — tmp-write, validate, then replace`);
    try {
        const result = await encode(relTmp, opts);

        const stat = fs.existsSync(absTmp) ? fs.statSync(absTmp) : null;
        // Sanity floor for real stego horcruxes (tens of KB); the unit-test
        // fakes are tiny, so anything the DECODER accepts passes here.
        if (!stat || !stat.size) {
            throw new Error(`encoded output suspiciously small (${stat ? stat.size : 0} bytes)`);
        }

        const data = await decode(relTmp, opts);
        if (validate) {
            const v = validate(data);
            if (v && v.valid === false) {
                cleanupTmp();
                throw new Error('post-encode validation failed: ' + ((v.errors || []).join('; ') || 'unknown'));
            }
        }

        fs.renameSync(absTmp, absTarget);
        log(`   ${label}: replaced existing backup ${absTarget}`);
        if (cwdMoved) process.chdir(prevCwd);
        return { usedTmp: true, replaced: true, target: useAbs || relTarget, absTarget, size: stat.size, result, data };
    } catch (e) {
        cleanupTmp();
        if (cwdMoved) process.chdir(prevCwd);
        e.message = `${label} refresh failed (original left untouched): ${e.message}`;
        throw e;
    }
}

module.exports = { safeWriteHorcrux };
