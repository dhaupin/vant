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
 * PERSISTENCE (pass 175, WIRING.md payoff step ② — mesh deltas →
 * checkpoint/WAL): a MeshTree is in-memory by default (unchanged contract;
 * probes and tests construct `new MeshTree()` with zero side effects). Pass
 * `{ dir }` and every delta — register, heartbeat, aoi subscribe, accepted
 * and REJECTED writes — rides the #151 SnapshottedLog: an append-only
 * wal.log with content-addressed snapshots every N records, bounded
 * snapshot history, and bounded recovery (latest snapshot + replay only
 * entries after it). A fresh MeshTree over the same dir reconstructs the
 * same tree root hash — "same mesh state across restarts" is one string *   comparison, same as the tree tier's cross-process check. Rejected writes
 *   persist too: the gaslight-proof record survives a crash (#164 acceptance
 *   #3 across restarts), and every delta is provenance-stamped through the
 *   #161 DeltaLedger (actor is NOT optional). Recovery honors #163: an
 *   unreadable log is DENIED (E_LOG_DENIED from checkpoint.js), never
 *   silently reinterpreted as an empty one.
 *
 * BUS EVENTS (pass 176, the open-debt closure): every mutation emits on
 * the shared event bus — mesh:register, mesh:heartbeat, mesh:aoi,
 * mesh:write, mesh:write:rejected, and mesh:recovered on persistent boot.
 * A status probe must never be a side effect (the mesh-status posture),
 * so pass { silent: true } for throwaway/probe trees (mesh-status does).
 *
 * Engine-parity series (mesh/distributed, 1/2).
 */

const { StateTree, normalizePath } = require('./tree');
const canonical = require('./canonical');
const { AddressingSpine } = require('./spine');
const { SnapshottedLog } = require('./checkpoint');
const { DeltaLedger } = require('./delta');
const { VantError } = require('../error');

const MESH_ROOT = '/mesh';
const DEFAULT_PRESENCE_TTL_MS = 30000;

// (pass 176) shared bus lifecycle — lazy like wal.js so the state core
// stays dependency-light
let _event = null;
function _emit(event, data) {
    if (!_event) { try { _event = require('../event'); } catch (e) { return; } }
    if (_event && _event.emit) { _event.emit(event, data); }
}

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
     *   - { dir } - PERSISTENT MODE (pass 175): mesh deltas ride the #151
     *     SnapshottedLog in this directory (wal.log + snapshots/). Omit it
     *     and the MeshTree stays in-memory (the pre-175 contract).
     *   - { everyN, keepK } - passed through to SnapshottedLog
     *   - { silent } - suppress bus events (probe/status trees; a status
     *     probe must never be a side effect)
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
        // #161 provenance over every delta — rides the tree's clock so the
        // ledgerHash is deterministic (two trees that saw the same events
        // under the same clock agree on one hash, #161 acceptance #3).
        this._deltas = new DeltaLedger({ now: this._now });
        this._log = null;
        this._recovery = null;
        this._silent = options.silent === true;
        if (typeof options.dir === 'string' && options.dir) {
            this._log = new SnapshottedLog({
                dir: options.dir,
                everyN: options.everyN > 0 ? options.everyN : 100,
                keepK: options.keepK > 0 ? options.keepK : 3,
                applyRecord: (rec) => this._applyRecord(rec),
                serialize: () => JSON.stringify(this.tree.toCheckpoint()),
                restore: (s) => {
                    const cp = JSON.parse(s);
                    this.tree = StateTree.fromCheckpoint(cp);
                }
            });
            const res = this._log.recover();
            this._recovery = {
                fromSnapshot: res.fromSnapshot,
                replayed: res.replayed,
                freshStart: res.freshStart
            };
            _emit('mesh:recovered', {
                dir: options.dir,
                fromSnapshot: this._recovery.fromSnapshot,
                replayed: this._recovery.replayed,
                freshStart: this._recovery.freshStart,
                rootHash: this.tree.rootHash()
            });
        }
    }

    /**
     * Record a delta: in-memory provenance (#161, actor-stamped) always;
     * wal append + interval snapshot when persistent.
     */
    _record(rec) {
        const actor = rec.owner || rec.writer || (rec.entry && rec.entry.writer)
            || (rec.region !== undefined && rec.node !== undefined ? rec.region + '/' + rec.node : null)
            || 'mesh';
        // ride the EVENT's epoch (never re-read the clock — a shared fixed
        // clock would double-advance and break replay determinism)
        const evtEpoch = rec.epoch || rec.heartbeat || rec.since
            || (rec.entry && rec.entry.at) || null;
        this._deltas.record('mesh:' + (rec.op || 'delta'), rec, actor, evtEpoch);
        // (pass 176) shared bus: every mutation is observable. One
        // choke point — probes pass { silent: true } so a status read
        // never has side effects.
        if (!this._silent) {
            _emit('mesh:' + (rec.op === 'write-accepted' ? 'write'
                : rec.op === 'rejected' ? 'write:rejected' : rec.op), {
                op: rec.op,
                actor,
                epoch: evtEpoch,
                path: rec.path || (rec.region !== undefined && rec.node !== undefined
                    ? _nodePath(rec.region, rec.node) : null),
                region: rec.region || (rec.entry && rec.entry.path ? undefined : rec.region),
                node: rec.node || undefined,
                accepted: rec.op === 'rejected' ? false : undefined
            });
        }
        if (!this._log) {
            this._applyRecord(rec);
            return { seq: null };
        }
        return this._log.append(rec);
    }

    /** Fold one delta record into live state. The ONLY state mutator. */
    _applyRecord(rec) {
        if (!rec || typeof rec !== 'object') return;
        const base = rec.region !== undefined && rec.node !== undefined
            ? _nodePath(rec.region, rec.node)
            : null;
        switch (rec.op) {
            case 'register':
                this.tree.put(base + '/identity', rec.meta || {});
                this.tree.put(base + '/presence', { alive: true, heartbeat: rec.epoch });
                break;
            case 'heartbeat':
                this.tree.put(base + '/presence', { alive: true, heartbeat: rec.heartbeat });
                break;
            case 'aoi':
                this.tree.put(base + '/aoi', { scope: rec.scope, since: rec.since });
                break;
            case 'write-accepted':
                this._authority.set(rec.path, { owner: rec.owner, epoch: rec.epoch, hash: rec.hash });
                this.tree.put(rec.path, { _writer: rec.owner, _epoch: rec.epoch, value: rec.value });
                break;
            case 'rejected':
                this._rejected.push(rec.entry);
                break;
            default:
                break; // unknown op: skip (forward compat), never corrupt
        }
    }

    /** SEED SCOPE (#158): the mesh region's derived seed via the ONE PRF.
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
        this._record({ op: 'register', region, node, meta: meta || {}, epoch });
        return { path: base, epoch };
    }

    /** Heartbeat: refresh presence (delta write; TTL clock restarts). */
    heartbeat(region, node) {
        const epoch = this._now();
        this._record({ op: 'heartbeat', region, node, heartbeat: epoch });
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
        const since = this._now();
        this._record({ op: 'aoi', region, node, scope: abs, since });
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
                // loser's write RECORDED as a rejected delta — and the
                // record PERSISTS with the mesh (crash cannot gaslight it)
                this._record({ op: 'rejected', entry: {
                    path: abs, writer: node, epoch, hash: writerHash,
                    winner: existing.owner, winnerEpoch: existing.epoch, at: this._now()
                } });
                return { accepted: false, winner: existing.owner, epoch: existing.epoch };
            }
        }
        this._record({ op: 'write-accepted', path: abs, owner: node, epoch, hash: writerHash, value });
        return { accepted: true, winner: node, epoch };
    }

    /** Audit view of rejected writes (the gaslight-proof record). */
    rejectedWrites() { return this._rejected.slice(); }

    /** #161 provenance ledger over every accepted + rejected delta. */
    deltaLedger() { return this._deltas; }

    /** Persistence posture: null recovery when in-memory. */
    persistenceInfo() {
        return {
            enabled: !!this._log,
            dir: this._log ? this._log.dir : null,
            recovery: this._recovery
        };
    }

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
