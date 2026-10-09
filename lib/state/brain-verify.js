'use strict';

/**
 * Brain Durability Tier (#166) — targeted fix
 * ============================================
 *
 * Brains (the crown jewels) are files + horcrux backups with no integrity
 * story between "last horcrux" and "now": a partial write, a bad sync, or
 * an overeager prune is undetectable until something reads wrong.
 *
 * Treat each brain as a state subtree: content-addressed nodes + a root
 * hash + periodic anchors (the #152 primitive). Then:
 *   - brain verify: recompute root over files, compare to last anchor,
 *   - horcrux = a VERIFIABLE export of (root hash + node set) — restore →
 *     verify → same root hash as at forge time,
 *   - a partial/corrupted brain file is DETECTED (hash mismatch with its
 *     node record) BEFORE it's read into context.
 *
 * The public/private clobber class of bugs (fixed in pass 71) becomes
 * structurally impossible over time: public and private are different
 * SUBTREES of one tree, and a merge is a hash-verified subtree graft.
 *
 * Engine-parity series (targeted fixes).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { StateAnchor } = require('./anchor');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** Content hash of one brain file's bytes. */
function fileHash(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

class BrainVerifier {
    /**
     * @param {string} brainDir - the brain tree root (models/private/<name>)
     * @param {object} [options] - { anchorLedgerPath }
     */
    constructor(brainDir, options = {}) {
        if (typeof brainDir !== 'string' || !brainDir) {
            throw _vantErr('brain-verify: brainDir required', 'E_BV_INPUT');
        }
        this.brainDir = path.resolve(brainDir);
        // anchor ledger lives INSIDE the brain tree it defends (pass 176):
        // <brainDir>/.brain-anchor.jsonl. The old pathFor() default resolved
        // the ledger against the ACTIVE process brain, so verifying brain X
        // while running as brain Y compared X's root against Y's anchors —
        // cross-brain false divergence (caught by the pass-176 health pins
        // the moment two different brains verified in one process). The
        // ledger is a STATE ledger, not a lock (no .locks/, no .lock suffix —
        // the lock-path authority and the audit gate stay untouched); the
        // dot prefix keeps it out of the verifier's own _collect() walk and
        // out of brain reads, so anchoring never perturbs the root.
        this.anchor = new StateAnchor(options.anchorLedgerPath ||
            path.join(this.brainDir, '.brain-anchor.jsonl'));
    }

    /** All content files (md/json/yaml/txt), relative paths, sorted.
     * Non-directory entries matching a content extension are included even
     * when they are not regular files — a symlink/fifo/special in a brain
     * tree is an integrity hazard that must SURFACE (#166/#163), not be
     * silently skipped.
     *
     * (pass 176) Runtime protocol-state subtrees are EXCLUDED (`state/`,
     * `orgchart/`): trust/consensus/market/registry ledgers and escrow
     * budgets mutate on every persist (orgchart/escrow.json even bumps a
     * `saved` ts on probe) and carry their OWN integrity story (tree-tier
     * rootHash on every event, WAL-backed writes). Including them made an
     * active brain diverge from its anchor within minutes — a health
     * tripwire that cries wolf. The crown jewels this tier defends are the
     * brain CONTENT files (identity, lessons, learnings, notes) that
     * should never move without intent. */
    _collect() {
        const out = [];
        const walk = (dir) => {
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
            for (const ent of entries) {
                if (ent.name.startsWith('.')) continue; // dot-dirs: locks, wal, anchor ledger
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (ent.name === 'state' || ent.name === 'orgchart') continue; // runtime protocol state — own integrity story
                    walk(full); continue;
                }
                if (!/\.(md|json|ya?ml|txt)$/i.test(ent.name)) continue;
                out.push(path.relative(this.brainDir, full));
            }
        };
        walk(this.brainDir);
        return out.sort();
    }

    /**
     * Compute the brain's CURRENT root over (relPath, fileHash) pairs.
     * One comparable hex string for "the brain right now".
     */
    currentRoot() {
        const h = crypto.createHash('sha256');
        const files = this._collect();
        for (const rel of files) {
            try {
                const bytes = fs.readFileSync(path.join(this.brainDir, rel));
                h.update(Buffer.from(rel + '\x00' + fileHash(bytes) + '\n', 'utf8'));
            } catch (e) {
                // unreadable file mid-verify is DENIED (#163), not skippable
                throw _vantErr('brain-verify: file unreadable — ' + rel + ': ' + e.message, 'E_BV_DENIED');
            }
        }
        h.update(Buffer.from('|count:' + files.length, 'utf8'));
        return h.digest('hex');
    }

    /**
     * Node manifest: per-file integrity records. A file whose hash
     * mismatches its node record is detected BEFORE content is read into
     * context (#166 acceptance #3).
     */
    manifest() {
        return this._collect().map(rel => {
            try {
                const bytes = fs.readFileSync(path.join(this.brainDir, rel));
                return { path: rel, hash: fileHash(bytes), size: bytes.length, ok: true };
            } catch (e) {
                return { path: rel, hash: null, size: 0, ok: false, error: e.message };
            }
        });
    }

    /** Verify against a specific expected root (e.g. from a horcrux). */
    verifyRoot(expectedRoot) {
        const current = this.currentRoot();
        return { ok: current === expectedRoot, current, expected: expectedRoot };
    }

    /**
     * Verify against the LAST ANCHOR (#166 acceptance #1). Returns
     * { ok, current, lastAnchored, divergence } where lastAnchored is the
     * anchor ENTRY ({root_hash, timestamp, cause, carrier}) or null —
     * (pass 177 fix) it used to be the bare hex root, while bin/horcrux.js
     * read entry fields off it (v.lastAnchored.timestamp → 'Invalid time
     * value' on every successful verify). One contract across all three
     * verifiers: StateAnchor.verify, BrainVerifier.verify, verifyStateRoot.
     */
    verify() {
        const current = this.currentRoot();
        const v = this.anchor.verify(current);
        return {
            ok: v.ok,
            current,
            lastAnchored: v.lastAnchored || null,
            divergence: v.firstDivergence
        };
    }

    /** Anchor the current root (call after known-good writes/syncs). */
    anchorNow(cause, carrier) {
        return this.anchor.anchor(this.currentRoot(), cause, carrier);
    }

    /**
     * Horcrux forge: export {root, manifest} — verifiable on restore, not
     * just decryptable. The manifest rides inside so restore can prove
     * byte-identity per file AND for the whole.
     */
    forgeHorcrux(label) {
        const root = this.currentRoot();
        const manifest = this.manifest();
        return {
            kind: 'vant-brain-horcrux',
            version: 1,
            label: String(label || '').slice(0, 100),
            forgedAt: Date.now(),
            root,
            manifest
        };
    }

    /**
     * Horcrux roundtrip check (#166 acceptance #2): restore = write files
     * (caller does the IO), then verify → same root as at forge time.
     * This method verifies a restored directory against a horcrux record.
     */
    verifyRestore(horcrux) {
        if (!horcrux || horcrux.kind !== 'vant-brain-horcrux') {
            throw _vantErr('brain-verify: not a horcrux record', 'E_BV_INPUT');
        }
        const v = this.verifyRoot(horcrux.root);
        return { ok: v.ok, current: v.current, forgedRoot: horcrux.root };
    }
}

module.exports = { BrainVerifier, fileHash };
