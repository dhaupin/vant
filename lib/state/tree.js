'use strict';

/**
 * Content-Addressed State Tree (#145, #147, #148)
 * ================================================
 *
 * One tree, path-addressed, content-hashed — the single state spine every
 * consumer (mesh #164, RAID #165, brains #166, worlds) rides instead of
 * building its own half-engine.
 *
 * - #145: every node's identity is its hash over (path, schemaId, canonical
 *   value bytes). "The state" is ONE root hash. Same fact written under two
 *   paths both succeed; same path = last-write-wins with a recorded write.
 * - #147: diff(oldRoot, newRoot) → changed paths (compare hashes, no phantom
 *   diffs — encoding noise is structurally impossible under #146);
 *   snapshot(scopePath) → deterministic pre-order node list;
 *   apply(snapshot) → replace subtree, verify scope root.
 * - #148: coarse scopes resolve to "main" when absent; identity payloads
 *   stamp their owning scope on the write path; scope snapshots contain
 *   ZERO nodes from sibling scopes.
 *
 * Path grammar: '/'-separated segments, each matching [A-Za-z0-9._-]+.
 * Paths are ABSOLUTE (leading '/'). Normalization is strict: '..' , empty
 * segments, and trailing slashes are refused — a crafted path never escapes
 * its namespace.
 *
 * Engine-parity series (state core 1/4, 3/4, 4/4).
 */

const crypto = require('crypto');
const canonical = require('./canonical');

const { SCHEMA_IDS } = canonical;

const PATH_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_SCOPE = 'main';

function _vantErr(msg, code, details) {
    return new (require('../error').VantError)(msg, { code, retryable: false, details: details || null });
}

/** Validate + normalize an absolute tree path. Throws E_STATE_PATH. */
function normalizePath(p) {
    if (typeof p !== 'string' || p.length === 0 || p.length > 2048) {
        throw _vantErr('state.tree: path must be a non-empty string', 'E_STATE_PATH');
    }
    if (p[0] !== '/') {
        throw _vantErr('state.tree: path must be absolute: ' + JSON.stringify(p.slice(0, 60)), 'E_STATE_PATH');
    }
    if (p.includes('..')) {
        throw _vantErr('state.tree: path traversal refused: ' + JSON.stringify(p.slice(0, 60)), 'E_STATE_PATH');
    }
    const segments = p.slice(1).split('/');
    if (segments.length === 0 || segments.some(s => !PATH_SEGMENT_RE.test(s))) {
        throw _vantErr('state.tree: invalid path segment in ' + JSON.stringify(p.slice(0, 60)), 'E_STATE_PATH');
    }
    return '/' + segments.join('/');
}

/**
 * #148: split a path into { scope, rest }. Coarse scope defaults to "main"
 * when absent, so pre-namespaced callers and new callers coexist:
 *   splitScope('/trust/peer_x')    → { scope: 'main', rest: 'trust/peer_x' }
 *   splitScope('/world/w1/zones')  → { scope: 'world/w1', rest: 'zones' }
 * Explicit scope roots (world/, mesh/, raid/) are the coarse dimension;
 * everything under them belongs to that scope.
 */
const SCOPE_ROOTS = ['world', 'mesh', 'raid'];

function splitScope(p) {
    const abs = normalizePath(p);
    const segs = abs.slice(1).split('/');
    if (segs.length >= 2 && SCOPE_ROOTS.includes(segs[0])) {
        return { scope: segs.slice(0, 2).join('/'), rest: segs.slice(2).join('/'), path: abs };
    }
    return { scope: DEFAULT_SCOPE, rest: segs.join('/'), path: abs };
}

/**
 * #148: stamp a payload with its owning scope. Pure write-path concern —
 * readers never need a registry lookup because the stamp rides the data.
 */
function stampScope(path, value) {
    const { scope } = splitScope(path);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return { ...value, _scope: scope };
    }
    return { _scope: scope, value };
}

class StateTree {
    /**
     * @param {object} [options]
     * @param {string} [options.schemaId] per-tree schema id (code identity)
     */
    constructor(options = {}) {
        // path → { hash, value } — the tree. Content is authoritative;
        // hashes are derived, never stored as truth.
        this._nodes = new Map();
        this._schemaId = options.schemaId || SCHEMA_IDS.NODE;
        this._writes = 0; // recorded write count (for audit/diff tests)
    }

    /** #145: put a value at a path. Returns the node hash. */
    put(path, value) {
        const abs = normalizePath(path);
        const stamped = stampScope(abs, value);
        const hash = canonical.nodeHash(abs, this._schemaId, stamped);
        this._nodes.set(abs, { hash, value: stamped });
        this._writes++;
        return hash;
    }

    /**
     * #145: get a value. Typed absence (issue #163 vocabulary):
     * returns { state: 'PRESENT', value, hash } or { state: 'ABSENT' } —
     * never null-and-a-prayer.
     */
    get(path) {
        const abs = normalizePath(path);
        const node = this._nodes.get(abs);
        if (!node) return { state: 'ABSENT' };
        return { state: 'PRESENT', value: node.value, hash: node.hash };
    }

    has(path) {
        return this.get(path).state === 'PRESENT';
    }

    /** Delete a path. Returns true if a node existed. */
    delete(path) {
        const abs = normalizePath(path);
        if (!this._nodes.has(abs)) return false;
        this._nodes.delete(abs);
        this._writes++;
        return true;
    }

    /** All paths, sorted (deterministic order everywhere). */
    paths() {
        return [...this._nodes.keys()].sort();
    }

    get size() { return this._nodes.size; }
    get writeCount() { return this._writes; }

    /**
     * #145: THE root hash — one comparable number for "the state right now".
     * Computed over sorted (path, nodeHash) pairs so any two trees with the
     * same facts agree byte-for-byte, cross-process.
     */
    rootHash() {
        const h = require('../hash').sha256H();
        h.update(Buffer.from('root|' + this._schemaId + '|' + this.size + '|', 'utf8'));
        for (const p of this.paths()) {
            h.update(Buffer.from(p + '\x00' + this._nodes.get(p).hash + '\n', 'utf8'));
        }
        return h.digest('hex');
    }

    /** Scope (#148) root hash: root over ONLY this scope's nodes. */
    scopeRootHash(scope) {
        const h = require('../hash').sha256H();
        let count = 0;
        for (const p of this.paths()) {
            if (splitScope(p).scope !== scope) continue;
            h.update(Buffer.from(p + '\x00' + this._nodes.get(p).hash + '\n', 'utf8'));
            count++;
        }
        h.update(Buffer.from('|count:' + count, 'utf8'));
        return h.digest('hex');
    }

    /**
     * #147: diff two root hashes' trees — here, diff THIS tree against an
     * arbitrary set of {path → hash}. Ordered list of changed paths:
     *   { path, kind: 'added'|'removed'|'changed', oldHash, newHash }
     * Compares HASHES (not values) so encoding noise cannot produce phantom
     * diffs; recursion-free because nodes are flat paths with hashes.
     */
    /**
     * #147: diff this tree against `other` — "what would I receive if I
     * adopted other's state": paths present in OTHER but not here are
     * 'added', present here but not in other are 'removed'. Accepts a
     * StateTree or a plain {path → hash} map. Compares HASHES (not values)
     * so encoding noise cannot produce phantom diffs.
     */
    diff(other) {
        const otherMap = other instanceof StateTree ? other._nodes : new Map(Object.entries(other || {}));
        const out = [];
        const all = new Set([...this._nodes.keys(), ...otherMap.keys()]);
        for (const p of [...all].sort()) {
            const mine = this._nodes.get(p);
            const theirs = otherMap.get(p);
            const myHash = mine ? mine.hash : (theirs && typeof theirs === 'object' ? theirs.hash : undefined);
            const theirHash = theirs ? (typeof theirs === 'object' && theirs.hash ? theirs.hash : theirs) : undefined;
            // normalize: otherMap entries may be hashes (strings) or nodes
            const tHash = typeof theirs === 'string' ? theirs : theirHash;
            if (!mine && theirs) out.push({ path: p, kind: 'added', oldHash: null, newHash: tHash });
            else if (mine && !theirs) out.push({ path: p, kind: 'removed', oldHash: myHash, newHash: null });
            else if (mine && theirs && myHash !== tHash) out.push({ path: p, kind: 'changed', oldHash: myHash, newHash: tHash });
        }
        return out;
    }

    /**
     * #147: snapshot a scope path — all nodes under the prefix (inclusive),
     * deterministic pre-order (sorted paths). Bounded by caller cap.
     * Returns { scope, rootHash, nodes: [{path, hash, value}], truncated }.
     */
    snapshot(scopePath, cap = 10000) {
        const abs = normalizePath(scopePath);
        const prefix = abs === '/' ? '/' : abs + '/';
        const nodes = [];
        let truncated = false;
        for (const p of this.paths()) {
            if (p !== abs && !p.startsWith(prefix)) continue;
            if (nodes.length >= cap) { truncated = true; break; }
            const n = this._nodes.get(p);
            nodes.push({ path: p, hash: n.hash, value: n.value });
        }
        const h = require('../hash').sha256H();
        for (const n of nodes) h.update(Buffer.from(n.path + '\x00' + n.hash + '\n', 'utf8'));
        return { scope: abs, rootHash: h.digest('hex'), nodes, truncated };
    }

    /**
     * #147: apply a snapshot — replace ONLY the subtree under the snapshot's
     * scope, then verify the scope root matches the sender's. Returns
     * { applied, verified, scopeRootHash }. Refuses on truncated snapshots
     * (applying a partial subtree would corrupt the scope).
     */
    apply(snapshot) {
        if (!snapshot || snapshot.scope === undefined || !Array.isArray(snapshot.nodes)) {
            throw _vantErr('state.tree.apply: malformed snapshot', 'E_STATE_SNAPSHOT');
        }
        if (snapshot.truncated) {
            throw _vantErr('state.tree.apply: refusing truncated snapshot', 'E_STATE_SNAPSHOT');
        }
        const abs = normalizePath(snapshot.scope);
        const prefix = abs === '/' ? '/' : abs + '/';
        // remove existing subtree, then insert snapshot nodes
        for (const p of this.paths()) {
            if (p === abs || p.startsWith(prefix)) this._nodes.delete(p);
        }
        for (const n of snapshot.nodes) {
            const nodeAbs = normalizePath(n.path);
            this._nodes.set(nodeAbs, { hash: n.hash, value: n.value });
        }
        // verify: recompute scope root from what we now hold
        const h = require('../hash').sha256H();
        const scopeNodes = this.snapshot(abs, snapshot.nodes.length + 1);
        for (const n of scopeNodes.nodes) h.update(Buffer.from(n.path + '\x00' + n.hash + '\n', 'utf8'));
        const scopeRootHash = h.digest('hex');
        return { applied: true, verified: scopeRootHash === snapshot.rootHash, scopeRootHash };
    }

    /** Cross-process determinism proof helper: serialize full tree (sorted). */
    toCheckpoint() {
        return {
            schemaId: this._schemaId,
            rootHash: this.rootHash(),
            nodes: this.paths().map(p => ({ path: p, hash: this._nodes.get(p).hash, value: this._nodes.get(p).value }))
        };
    }

    /** Rebuild from a checkpoint (verification path for kill-recovery tests). */
    static fromCheckpoint(cp) {
        const t = new StateTree({ schemaId: cp.schemaId });
        for (const n of cp.nodes) t._nodes.set(normalizePath(n.path), { hash: n.hash, value: n.value });
        return t;
    }
}

module.exports = {
    StateTree,
    normalizePath,
    splitScope,
    stampScope,
    SCOPE_ROOTS,
    DEFAULT_SCOPE,
    PATH_SEGMENT_RE
};
