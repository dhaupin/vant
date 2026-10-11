'use strict';

/**
 * Provenance / Compliance Bundle (Wave U5 — labs/prd-universe.md §U5)
 * ===================================================================
 *
 * `exportBundle({ out })` assembles ONE self-verifying directory:
 *
 *   manifest.json        — registry export (who is who, point-in-time)
 *   citations.json       — the citation ledger (provenance of knowledge)
 *   audit-excerpt.json   — audit ledger excerpt (scoped to a query/mipmap)
 *   horcrux.svg          — encrypted brain snapshot (password-gated per
 *                          the horcrux filename convention p_<password>)
 *   content-manifest.json— every bundled file L-hashed (a RUNNING hash
 *                          list: sha256(prev + filename + fileHash) per
 *                          entry in bundle order) with a terminal bundle
 *                          digest; lib/hash.js is the only hash source.
 *
 * `verifyBundle({ dir })` recomputes the content manifest — byte-tamper
 * detection FAILS CLOSED (typed E_BUNDLE_TAMPERED, never a warning).
 *
 * Design rules honored:
 *   - One hash source: every digest rides lib/hash.js (no local crypto).
 *   - Verify is read-only and recomputes; it never trusts the manifest
 *     fields for the DIGEST of the manifest itself — the running-list
 *     digest in `bundle.digest` anchors the whole set.
 *   - No fs hand-rolling where the arch-A store exists — but a bundle is
 *     an EXPORT artifact (operator-facing, arbitrary out dir), so plain
 *     atomic writes via primitives.atomicWriteFile are the mandated write
 *     path (same as backup/horcrux).
 */

const fs = require('fs');
const path = require('path');

function _vantErr(msg, code) {
    return new (require('./error').VantError)(msg, { code, retryable: false });
}

const hash = require('./hash');
const atomicWriteFile = require('./primitives').atomicWriteFile;

/** Bundle format version. Bump ONLY when the on-disk shape changes. */
const BUNDLE_V = 1;
/** Canonical names: a bundle is always these five files (verify refuses extras). */
const BUNDLE_FILES = ['manifest.json', 'citations.json', 'audit-excerpt.json', 'horcrux.svg', 'content-manifest.json'];

// ==================== L-HASHED RUNNING CONTENT MANIFEST ====================

/**
 * The "L-hash": a LINEAR/running hash list. Order matters — entry i's
 * digest folds the previous entry's digest, so deleting/reordering/
 * inserting any file changes every entry after it and the terminal digest.
 *
 *   entry(i) = sha256( digest(i-1) || name || ':' || fileHash )
 *   bundle digest = digest(last entry)
 */
function computeContentManifest(dir, files) {
    const entries = [];
    let prev = hash.sha256('vant-bundle-genesis');
    for (const name of files) {
        const buf = fs.readFileSync(path.join(dir, name));
        const fileHash = hash.sha256(buf);
        const link = hash.sha256(prev + name + ':' + fileHash);
        entries.push({ file: name, sha256: fileHash, bytes: buf.length, chain: link });
        prev = link;
    }
    const contentManifest = {
        kind: 'vant-bundle-content-manifest',
        v: BUNDLE_V,
        hashAlgo: 'sha256',
        chainAlgo: 'running(L): sha256(prev + file + ":" + fileHash)',
        entries,
        digest: prev,
        builtAt: Date.now()
    };
    return { contentManifest, digest: prev };
}

// ==================== U5.1 — ASSEMBLE ====================

/**
 * @param {object} options
 * @param {string} options.out - output directory (created; must be empty or only prior bundle files overwritten)
 * @param {string} [options.horcruxPassword] - password for the encrypted brain snapshot
 *   (required when includeHorcrux !== false; per the horcrux convention the password is
 *   needed to restore, so an export WITHOUT it must declare omitHorcrux)
 * @param {boolean} [options.includeHorcrux=true] - omit with `false` (bundle then verifies fine but carries no brain)
 * @param {object} [options.auditQuery] - scope the audit excerpt: { action?, limit?, level? } (default last 100 entries)
 * @param {string} [options.label] - free label recorded in the manifest envelope
 * @returns {{ ok: true, dir, digest, files } | { ok: false, error, code }}
 */
async function exportBundle(options = {}) {
    try {
        const out = String(options.out || '');
        if (!out) throw _vantErr('export-bundle: out directory required (vant export bundle --out <dir>)', 'E_BUNDLE_OUT');
        if (path.isAbsolute(out)) {
            throw _vantErr('export-bundle: out must be a RELATIVE path — absolute paths are blocked by the vaf traversal gate and the bundle must stay inside the repo tree', 'E_BUNDLE_OUT');
        }
        const outDir = path.resolve(out);
        // KEEP the relative form: transform.toHorcrux re-validates the
        // horcrux sink path with vaf.checkPathTraversal, which blocks
        // absolute /home/… residency paths (fail-closed); a relative path
        // under the repo passes and is exactly what the operator asked for.
        fs.mkdirSync(outDir, { recursive: true });

        // ---- 1. manifest.json — registry export (point-in-time who-is-who).
        const registryMod = require('./registry');
        const registryExport = registryMod.gatherState();
        atomicWriteFile(path.join(outDir, 'manifest.json'), JSON.stringify(registryExport, null, 2), 'utf8');

        // ---- 2. citations.json — the citation ledger (provenance of knowledge).
        let citations = [];
        try { citations = require('./citations').getAll() || []; } catch (e) { citations = []; }
        atomicWriteFile(path.join(outDir, 'citations.json'), JSON.stringify({
            kind: 'vant-bundle-citations', v: BUNDLE_V, count: citations.length, sources: citations
        }, null, 2), 'utf8');

        // ---- 3. audit-excerpt.json — audit ledger excerpt (scoped).
        const auditMod = require('./audit');
        const q = options.auditQuery || {};
        let excerpt = [];
        try {
            const ledger = auditMod.getLedger();
            const all = ledger && Array.isArray(ledger.entries) ? ledger.entries : [];
            let rows = all;
            if (q.action) rows = rows.filter(e => typeof e.action === 'string' && e.action.includes(q.action));
            if (q.level) rows = rows.filter(e => e.level === q.level);
            const limit = Number.isFinite(q.limit) ? q.limit : 100;
            excerpt = rows.slice(-Math.abs(limit));
        } catch (e) { excerpt = []; }
        atomicWriteFile(path.join(outDir, 'audit-excerpt.json'), JSON.stringify({
            kind: 'vant-bundle-audit-excerpt', v: BUNDLE_V,
            query: { action: q.action || null, level: q.level || null, limit: Number.isFinite(q.limit) ? q.limit : 100 },
            count: excerpt.length,
            entries: excerpt
        }, null, 2), 'utf8');

        // ---- 4. horcrux.svg — encrypted brain snapshot (password-gated).
        const includeHorcrux = options.includeHorcrux !== false;
        if (includeHorcrux) {
            const transform = require('./transform');
            const horcruxPath = path.join(out, 'horcrux.svg'); // relative (see the out gate above): toHorcrux re-vaf-validates its sink and blocks absolute residency paths
            let password = options.horcruxPassword;
            if (!password) {
                try {
                    const secret = require('./secret');
                    password = await secret.get('brain');
                } catch (e) { password = null; }
            }
            if (!password) {
                throw _vantErr('export-bundle: horcruxPassword required for the encrypted brain snapshot (or pass includeHorcrux:false to omit it)', 'E_BUNDLE_PASSWORD');
            }
            const result = await transform.toHorcrux(horcruxPath, { password });
            if (!result || (result.embedded !== true)) {
                throw _vantErr('export-bundle: horcrux embed failed (' + ((result && result.reason) || 'unknown') + ')', 'E_BUNDLE_HORCRUX');
            }
        }

        // ---- 5. content-manifest.json — L-hashed running manifest over the
        // OTHER four files (the manifest itself is anchored by the returned
        // digest; verify recomputes it against `bundle.json`).
        const dataFiles = includeHorcrux
            ? ['manifest.json', 'citations.json', 'audit-excerpt.json', 'horcrux.svg']
            : ['manifest.json', 'citations.json', 'audit-excerpt.json'];
        const { contentManifest, digest } = computeContentManifest(outDir, dataFiles);
        atomicWriteFile(path.join(outDir, 'content-manifest.json'), JSON.stringify(contentManifest, null, 2), 'utf8');

        // bundle.json — the one-file handle: digest + what's inside. It is
        // NOT part of the hash chain (it names the chain's terminal digest);
        // verify re-derives the digest and compares.
        atomicWriteFile(path.join(outDir, 'bundle.json'), JSON.stringify({
            kind: 'vant-bundle', v: BUNDLE_V,
            digest,
            includesHorcrux: includeHorcrux,
            files: dataFiles.concat(['content-manifest.json']),
            label: String(options.label || '').slice(0, 200) || null,
            exportedAt: Date.now()
        }, null, 2), 'utf8');

        return { ok: true, dir: outDir, digest, files: dataFiles.concat(['content-manifest.json']), registry: registryExport.agents ? registryExport.agents.length : 0, citations: citations.length, auditEntries: excerpt.length };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_BUNDLE' };
    }
}

// ==================== U5.2 — VERIFY (fail-closed) ====================

/**
 * Recompute the L-hashed content manifest over the bundle directory and
 * compare against the recorded manifest + bundle.json digest.
 *
 * @param {object} options
 * @param {string} options.dir - bundle directory
 * @returns {{ ok: true, digest, verified: string[] } |
 *            { ok: false, error, code, detail }}
 */
function verifyBundle(options = {}) {
    try {
        const dir = String(options.dir || '');
        if (!dir) throw _vantErr('export-bundle: bundle directory required (vant export verify <dir>)', 'E_BUNDLE_OUT');
        const bundleDir = path.resolve(dir);
        const bundlePath = path.join(bundleDir, 'bundle.json');
        if (!fs.existsSync(bundlePath)) {
            throw _vantErr('export-bundle: bundle.json missing in ' + bundleDir + ' — not a vant bundle', 'E_BUNDLE_ABSENT');
        }
        let bundle;
        try { bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')); }
        catch (e) { throw _vantErr('export-bundle: bundle.json unreadable — DENIED, not absent: ' + e.message, 'E_BUNDLE_DENIED'); }
        if (!bundle || bundle.kind !== 'vant-bundle' || !bundle.digest) {
            throw _vantErr('export-bundle: bundle.json is not a vant-bundle', 'E_BUNDLE_ABSENT');
        }
        const manifestPath = path.join(bundleDir, 'content-manifest.json');
        if (!fs.existsSync(manifestPath)) {
            throw _vantErr('export-bundle: content-manifest.json missing — bundle incomplete', 'E_BUNDLE_ABSENT');
        }
        let recorded;
        try { recorded = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
        catch (e) { throw _vantErr('export-bundle: content-manifest.json unreadable: ' + e.message, 'E_BUNDLE_DENIED'); }

        // Files on disk must be EXACTLY the manifest's file set: an extra
        // file or a missing file is tamper, not noise.
        const onDisk = fs.readdirSync(bundleDir).filter(f => fs.statSync(path.join(bundleDir, f)).isFile());
        const expected = recorded.entries.map(e => e.file).concat(['bundle.json', 'content-manifest.json']);
        const extra = onDisk.filter(f => !expected.includes(f));
        const missing = recorded.entries.filter(e => !onDisk.includes(e.file));
        if (extra.length || missing.length) {
            throw _vantErr('export-bundle: file set drifted (' +
                (extra.length ? 'extra: ' + extra.join(', ') + ' ' : '') +
                (missing.length ? 'missing: ' + missing.map(m => m.file).join(', ') : '') + ')',
                'E_BUNDLE_TAMPERED');
        }

        // Recompute the running chain over the SAME ORDER.
        const { contentManifest } = computeContentManifest(bundleDir, recorded.entries.map(e => e.file));

        // 1. Per-file hashes must match the recorded manifest...
        for (let i = 0; i < contentManifest.entries.length; i++) {
            const a = contentManifest.entries[i], b = recorded.entries[i];
            if (a.file !== b.file || a.sha256 !== b.sha256 || a.chain !== b.chain) {
                throw _vantErr('export-bundle: TAMPERED — mismatch at entry ' + i + ' (' + b.file + '), recorded ' + String(b.sha256).slice(0, 12) + '… vs on-disk ' + String(a.sha256).slice(0, 12) + '…', 'E_BUNDLE_TAMPERED');
            }
        }
        // 2. ...the terminal digest must match the recorded manifest...
        if (contentManifest.digest !== recorded.digest) {
            throw _vantErr('export-bundle: TAMPERED — content-manifest digest drift (recorded ' + String(recorded.digest).slice(0, 12) + '… vs recomputed ' + String(contentManifest.digest).slice(0, 12) + '…)', 'E_BUNDLE_TAMPERED');
        }
        // 3. ...and bundle.json must name THIS chain (tampering the recorded
        //    manifest AND bundle.json together is caught here: the recomputed
        //    digest of the ACTUAL bytes is the truth).
        if (bundle.digest !== contentManifest.digest) {
            throw _vantErr('export-bundle: TAMPERED — bundle.json names a different chain (' + String(bundle.digest).slice(0, 12) + '… vs recomputed ' + String(contentManifest.digest).slice(0, 12) + '…)', 'E_BUNDLE_TAMPERED');
        }

        return { ok: true, digest: contentManifest.digest, verified: recorded.entries.map(e => e.file), includesHorcrux: !!bundle.includesHorcrux, label: bundle.label || null };
    } catch (e) {
        if (e.code && String(e.code).startsWith('E_BUNDLE')) {
            return { ok: false, error: e.message, code: e.code };
        }
        return { ok: false, error: e.message, code: 'E_BUNDLE' };
    }
}

module.exports = {
    exportBundle,
    verifyBundle,
    computeContentManifest,
    BUNDLE_V,
    BUNDLE_FILES
};
