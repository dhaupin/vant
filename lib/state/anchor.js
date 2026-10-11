'use strict';

/**
 * Root-Hash Content Anchor (#152) — storage, 4/5
 * ===============================================
 *
 * `lib/anchor.js` anchors PATHS (where is the install). This anchors STATE.
 * The state root hash is itself an anchor: written with a timestamp and a
 * short cause string into an append-only ledger (a git commit hash per
 * anchor is the natural carrier for a git-native system — pass the commit
 * as `carrier`).
 *
 * Now:
 *   - "same state?" between two agents = compare one hex string,
 *   - tamper evidence = recompute root over current nodes, compare to last
 *     anchor,
 *   - audit = the anchor chain IS the history.
 *
 * Ledger is append-only JSONL; survives process restarts via the file
 * carrier (default: under the brain's state dir, gitignored like all
 * protocol state).
 *
 * Engine-parity series (storage, 4/5).
 */

const fs = require('fs');
const path = require('path');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

class StateAnchor {
    /**
     * @param {string} ledgerPath - append-only JSONL file (carrier)
     */
    constructor(ledgerPath) {
        if (typeof ledgerPath !== 'string' || !ledgerPath) {
            throw _vantErr('state.anchor: ledgerPath required', 'E_ANCHOR_PATH');
        }
        this.ledgerPath = ledgerPath;
    }

    _readAll() {
        try {
            if (!fs.existsSync(this.ledgerPath)) return [];
            const lines = fs.readFileSync(this.ledgerPath, 'utf8').split('\n').filter(Boolean);
            const out = [];
            for (const line of lines) {
                try { out.push(JSON.parse(line)); } catch (e) { /* torn tail line — anchors are append-only, skip */ }
            }
            return out;
        } catch (e) {
            // unreadable ledger is a DENIED situation, not an empty one (#163):
            // surface it — verify() must not bless an unreadable history
            throw _vantErr('state.anchor: ledger unreadable: ' + e.message, 'E_ANCHOR_READ');
        }
    }

    /**
     * Record {root_hash, timestamp, cause} append-only. Optional carrier
     * (e.g. a git commit hash) rides the entry. Returns the entry.
     */
    anchor(rootHash, cause, carrier) {
        if (typeof rootHash !== 'string' || !/^[0-9a-f]{64}$/.test(rootHash)) {
            throw _vantErr('state.anchor: rootHash must be a sha256 hex string', 'E_ANCHOR_INPUT');
        }
        const entry = {
            root_hash: rootHash,
            timestamp: Date.now(),
            cause: String(cause || '').slice(0, 200),
            carrier: carrier === undefined ? null : String(carrier)
        };
        fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
        fs.appendFileSync(this.ledgerPath, JSON.stringify(entry) + '\n');
        return entry;
    }

    /** Latest anchor entry, or { state: 'ABSENT' } (#163 typed absence). */
    last() {
        const all = this._readAll();
        if (all.length === 0) return { state: 'ABSENT' };
        return { state: 'PRESENT', entry: all[all.length - 1] };
    }

    /** Full chain (audit = the chain IS the history). */
    chain() { return this._readAll(); }

    /**
     * Verify: recompute the current root (caller supplies the recomputed
     * hash — this module stays storage-agnostic) and compare to the last
     * anchor. Returns { ok, lastAnchored, firstDivergence } where
     * firstDivergence is a cause string naming the latest good anchor.
     */
    verify(currentRootHash) {
        const last = this.last();
        if (last.state === 'ABSENT') {
            return { ok: false, lastAnchored: null, firstDivergence: 'no anchors recorded yet' };
        }
        const ok = last.entry.root_hash === currentRootHash;
        return {
            ok,
            lastAnchored: last.entry,
            firstDivergence: ok ? null :
                'state diverged since anchor at ' + new Date(last.entry.timestamp).toISOString() +
                ' (cause: ' + (last.entry.cause || 'unspecified') + ')'
        };
    }
}

module.exports = { StateAnchor };
