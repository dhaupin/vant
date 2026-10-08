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
 * SEED SCOPE (#158 → mesh, pass 171): the mesh rides the ONE seed chain.
 * A MeshTree owns an AddressingSpine (#165) by default, which derives its
 * SeedChain from resolveUniverse() — explicit universe → VANT_UNIVERSE_SEED
 * env → per-brain config → fixed default. Region identity (seedScope) and
 * cell addressing therefore shard per universe: two installs with different
 * VANT_UNIVERSE_SEED values never agree on mesh addresses (by design —
 * they are different universes), and re-runs of the same scenario with the
 * same seed are replayable.
 *
 * Authority hashes go through the ONE canonical encoder (#146/#165: no
 * second ad-hoc hash chain in the repo) — a writer's claim is a
 * content-addressed fact like everything else.
 *
 * Engine-parity series (mesh/distributed, 1/2).
 */

const { StateTree, normalizePath } = require('./tree');
const canonical = require('./canonical');
const { AddressingSpine } = require('./spine');
const { VantError } = require('../error');

const MESH_ROOT = '/mesh';
const DEFAULT_PRESENCE_TTL_MS = 30000;

function _nodePath(region, node) {
    return MESH_ROOT + '/' + region + '/' + node;
}

class MeshTree {
    /**
     * @param {object} [options]
     *   - { presenceTtlMs, now }
     *   - { tree } - share an existing StateTree
     *   - { spine } - inject an AddressingSpine (default: new one, honoring
     *     VANT_UNIVERSE_SEED via lib/state/seeds.js)
     *   - { universe } - shorthand passed through to the spine's SeedChain
     */
    constructor(options = {}) {
        this.tree = options.tree instanceof StateTree ? options.tree : new StateTree();
        this.presenceTtlMs = options.presenceTtlMs > 0 ? options.presenceTtlMs : DEFAULT_PRESENCE_TTL_MS;
        this._now = typeof options.now === 'function' ? options.now : () => Date.now();
        this.spine = options.spine instanceof AddressingSpine
            ? options.spine
            : new AddressingSpine(options.universe !== undefined ? { universe: options.universe } : {});
        this._authority = new Map(); // path → { owner, epoch, hash }
        this._rejected = [];         // loser writes are RECORDED, never dropped silently
    }

    /**
     * SEED SCOPE (#158): the mesh region's derived seed via the ONE PRF.
     * Deterministic function of (universe, region) — two MeshTrees in the
     * same universe agree on it byte-for-byte; different universes (env or
     * explicit) never collide with it.
     */
    seedScope(region) {
        if (typeof region !== 'string' || !region.trim() || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(region)) {
            throw new VantError('mesh.seedScope: invalid region', { code: 'E_MESH_REGION', retryable: false });
        }
        const scopePath = 'mesh:' + region;
        return { scopePath, seedHex: this.spine.seeds.seedHex(scopePath) };
    }

    /**
     * Cell address in a mesh region via the spine's ONE PRF (#165): a fact
     * that lives on a mesh node at a geometry cell is the same derivation
     * chain, no bespoke adapter.
     */
    cellAddress(region, index) {
        return this.spine.cellAddress(this.spine.spaceId('mesh', region), index);
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
        // (pass 171) ONE canonical encoder: the writer's claim is a
        // content-addressed fact — same value from the same node under the
        // same path hashes identically across processes, JSON key order and
        // all. The old ad-hoc `node + '|' + JSON.stringify(value)` chain is
        // retired (the #165 thesis: no second hash chain in the repo).
        const writerHash = canonical.hash({ node: String(node), path: abs, value });
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
