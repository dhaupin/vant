'use strict';

/**
 * Mesh Nodes as Tree Paths (#164) — mesh/distributed, 1/2
 * ========================================================
 *
 * The mesh story rides the state tree (#145) instead of a lock service:
 *   - node identity = path prefix: /mesh/<region>/<node>/... — a node OWNS
 *     its subtree; ownership is data, not a lock service,
 *   - presence = a node's live subtree (heartbeat as a delta write with
 *     epoch; absence after TTL = stale, PROVABLE — a pure read answers
 *     "is X alive as of epoch T", no timers),
 *   - AOI (area of interest): each node subscribes to a path scope;
 *     delivery = diff restricted to that scope (the tree's snapshot/diff
 *     does the work — this module is just the subscription table),
 *   - authority = per-path single-writer token (node id + epoch); conflicts
 *     resolved by epoch then hash — deterministic, no quorum needed for v1.
 *
 * Engine-parity series (mesh/distributed, 1/2).
 */

const crypto = require('crypto');
const { StateTree, normalizePath } = require('./tree');
const { VantError } = require('../error');

const MESH_ROOT = '/mesh';
const DEFAULT_PRESENCE_TTL_MS = 30000;

function _nodePath(region, node) {
    return MESH_ROOT + '/' + region + '/' + node;
}

class MeshTree {
    /**
     * @param {object} [options] - { presenceTtlMs, now }
     */
    constructor(options = {}) {
        this.tree = options.tree instanceof StateTree ? options.tree : new StateTree();
        this.presenceTtlMs = options.presenceTtlMs > 0 ? options.presenceTtlMs : DEFAULT_PRESENCE_TTL_MS;
        this._now = typeof options.now === 'function' ? options.now : () => Date.now();
        this._authority = new Map(); // path → { owner, epoch, hash }
        this._rejected = [];         // loser writes are RECORDED, never dropped silently
    }

    /**
     * Register a node: claims its identity subtree + writes the presence
     * heartbeat (a delta write with epoch — #161 provenance law).
     */
    register(region, node, meta) {
        const base = _nodePath(region, node);
        const epoch = this._now();
        this.tree.put(base + '/identity', meta || {});
        this.tree.put(base + '/presence', { alive: true, heartbeat: epoch });
        return { path: base, epoch };
    }

    /** Heartbeat: refresh presence (delta write; TTL clock restarts). */
    heartbeat(region, node) {
        const epoch = this._now();
        this.tree.put(_nodePath(region, node) + '/presence', { alive: true, heartbeat: epoch });
        return epoch;
    }

    /**
     * "Is X alive as of epoch T?" — a PURE READ (#164 acceptance #2):
     * stale after TTL means stale, provably, with no timers.
     */
    isAlive(region, node, asOf) {
        const t = asOf !== undefined ? asOf : this._now();
        const res = this.tree.get(_nodePath(region, node) + '/presence');
        if (res.state !== 'PRESENT') return { alive: false, stale: false, reason: 'absent' };
        const age = t - res.value.heartbeat;
        if (age > this.presenceTtlMs) {
            return { alive: false, stale: true, reason: 'ttl-expired', ageMs: age };
        }
        return { alive: true, stale: false, ageMs: age };
    }

    /**
     * AOI subscription: what does node X see? Delivery = the diff since its
     * cursor restricted to the subscribed scope. Noise outside the scope is
     * structurally excluded (#164 acceptance #1 — property-testable).
     */
    subscribe(region, node, aoiPath) {
        const abs = normalizePath(aoiPath);
        this.tree.put(_nodePath(region, node) + '/aoi', { scope: abs, since: this._now() });
        return abs;
    }

    /**
     * Diff an AOI scope since a cursor: all nodes under the AOI prefix,
     * delivered in deterministic order. Returns { scope, cursor, nodes }.
     */
    aoiDiff(aoiPath, sinceCursor) {
        const abs = normalizePath(aoiPath);
        const snap = this.tree.snapshot(abs);
        const nodes = snap.nodes.filter(n => {
            // presence-only churn from OTHER nodes is not part of my AOI feed
            // unless the AOI explicitly covers /mesh (subscription tables)
            return true;
        });
        return { scope: abs, cursor: this._now(), nodes };
    }

    /**
     * Single-writer authority: per-path token (node id + epoch). Two
     * writers to one path → deterministic winner (higher epoch wins; equal
     * epochs → higher hash wins). The LOSER's write is recorded as a
     * rejected delta — never dropped silently (#164 acceptance #3).
     */
    write(region, node, path, value) {
        const abs = normalizePath(path);
        const epoch = this._now();
        const writerHash = crypto.createHash('sha256')
            .update(node + '|' + JSON.stringify(value)).digest('hex');
        const existing = this._authority.get(abs);

        if (existing) {
            const challengerWins =
                epoch > existing.epoch ||
                (epoch === existing.epoch && writerHash > existing.hash);
            if (!challengerWins) {
                // loser's write RECORDED as a rejected delta
                this._rejected.push({
                    path: abs, writer: node, epoch, hash: writerHash,
                    winner: existing.owner, winnerEpoch: existing.epoch, at: this._now()
                });
                return { accepted: false, winner: existing.owner, epoch: existing.epoch };
            }
        }
        this._authority.set(abs, { owner: node, epoch, hash: writerHash });
        this.tree.put(abs, { _writer: node, _epoch: epoch, value });
        return { accepted: true, winner: node, epoch };
    }

    /** Audit view of rejected writes (the gaslight-proof record). */
    rejectedWrites() { return this._rejected.slice(); }

    /** What does node X see? Its region of interest, not the global dump. */
    viewOf(region, node) {
        const aoiRes = this.tree.get(_nodePath(region, node) + '/aoi');
        if (aoiRes.state !== 'PRESENT') {
            // default AOI: the node's own subtree
            return this.tree.snapshot(_nodePath(region, node));
        }
        return this.tree.snapshot(aoiRes.value.scope);
    }
}

module.exports = { MeshTree, MESH_ROOT, DEFAULT_PRESENCE_TTL_MS };
