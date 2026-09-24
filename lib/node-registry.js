/**
 * Node Registry (v0.8.6)
 * WITH EVENT EMISSIONS - peer events emit globally
 * Peer discovery for distributed agents
 *
 * Usage:
 *   const registry = require('./registry');
 *   registry.register({ host: 'localhost', port: 3100 });
 *   const peers = registry.discover();
 *
 * (pass 36 / prd-vant-os Wave 1) PERSISTENT — the peer table hydrates
 * from models/private/<brain>/state/node-registry.json on first touch
 * and writes through on every mutation. This file is consensus's
 * vote-verification anchor, so losing it on restart broke the whole
 * protocol layer (registry-verified votes had nothing to verify
 * against). Read-denial throws E_STATE_READ — never resets state
 * (pass-31 rule from agents/internal.js).
 */

const path = require('path');

// ==================== STATE STORE (prd-vant-os arch A) ====================

const STATE_FILE = 'state/node-registry.json';
const BRAIN_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function _currentBrain() {
    // (consistency with brain.getBrainPath) VANT_BRAIN env override wins,
    // then the active brain — charset-guarded either way, because the name
    // becomes a path segment.
    const envBrain = process.env.VANT_BRAIN;
    if (envBrain && BRAIN_SEGMENT_RE.test(envBrain)) return envBrain;
    try {
        const brain = require('./brain');
        const name = brain.getCurrentBrain ? brain.getCurrentBrain() : 'vant';
        return BRAIN_SEGMENT_RE.test(name) ? name : 'vant';
    } catch (e) {
        return 'vant';
    }
}

// The store is resolved PER CALL: pushBrain moves the active brain, and
// state must move with it (same pattern as lib/teams.js orgchart store).
// dirname becomes the FileStorage basePath so containment/symlink/VAF/
// atomic-write gates wrap every read/write.
function _getStore() {
    const storePath = 'models/private/' + _currentBrain() + '/' + STATE_FILE;
    const Storage = require('./storage');
    return {
        store: new Storage.FileStorage({ basePath: path.resolve(path.dirname(storePath)) }),
        file: path.basename(storePath)
    };
}

let _hydrated = false;

/** Hydrate the peer table from disk. Missing file = fresh start. */
function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    let snapshot;
    try {
        const { store, file } = _getStore();
        if (!store.has(file)) return; // fresh install / first run on this brain
        snapshot = JSON.parse(store.read(file));
    } catch (e) {
        // (pass-31 rule) READ DENIAL IS NOT CORRUPTION. A sandbox denial
        // must surface, not silently wipe the peer table consensus verifies
        // votes against. Parse failures may reset (loudly).
        if (e && e.code === 'STORAGE_READ_DENIED') {
            throw new (require('./error').VantError)('Node registry state unreadable: ' + e.message,
                { code: 'E_STATE_READ', retryable: false });
        }
        console.warn('[node-registry] State file unreadable, starting empty:', e.message);
        return;
    }
    if (snapshot && Array.isArray(snapshot.nodes)) {
        let n = 0;
        for (const entry of snapshot.nodes) {
            if (entry && entry.id && !_nodes.has(entry.id)) {
                _nodes.set(entry.id, entry);
                n++;
            }
        }
        if (n > 0) {
            try { require('./audit').info('[node-registry] Hydrated ' + n + ' peers from state'); } catch (e) {}
        }
    }
}

/** Write-through the full peer table (atomic via the storage chain). */
function _persist() {
    try {
        const { store, file } = _getStore();
        store.write(file, JSON.stringify({
            nodes: Array.from(_nodes.values()),
            savedAt: Date.now()
        }, null, 2));
    } catch (e) {
        console.error('[node-registry] Persist failed:', e.message);
    }
}

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const _nodes = new Map();
let _nodeId = 0;

// Register this node
function register(node) {
    _hydrate();
    const id = node.id || `node_${++_nodeId}`;
    const entry = {
        id,
        host: node.host || 'localhost',
        port: node.port || 3457,
        name: node.name || id,
        status: node.status || 'joining',
        lastSeen: Date.now(),
        metadata: node.metadata || {}
    };
    _nodes.set(id, entry);
    _persist();

    // Auto-heartbeat: mark as alive on register
    heartbeat(id);

    // EVENT: node registered
    _emit('node-registry:registered', { id, host: entry.host, port: entry.port, timestamp: Date.now() });

    return entry;
}

// Discover peers
function discover(filters = {}) {
    const peers = [];
    const now = Date.now();
    const timeout = filters.timeout || 30000; // 30s default

    for (const node of _nodes.values()) {
        if (now - node.lastSeen > timeout) continue;
        if (filters.status && node.status !== filters.status) continue;
        if (filters.name && node.name !== filters.name) continue;
        peers.push(node);
    }

    return peers;
}

// Heartbeat
function heartbeat(nodeId) {
    _hydrate();
    const node = _nodes.get(nodeId);
    if (node) {
        node.lastSeen = Date.now();
        node.status = 'alive';
        _persist();
    }
    return node;
}

// Unregister
function unregister(nodeId) {
    _hydrate();
    const removed = _nodes.delete(nodeId);
    if (removed) _persist();
    return removed;
}

// Get node
function get(nodeId) {
    _hydrate();
    return _nodes.get(nodeId);
}

// All nodes
function list() {
    _hydrate();
    return Array.from(_nodes.values());
}

// Stats
function getStats() {
    _hydrate();
    const nodes = Array.from(_nodes.values());
    const now = Date.now();
    return {
        total: _nodes.size,
        alive: nodes.filter(n => n.status === 'alive').length,
        joining: nodes.filter(n => n.status === 'joining').length,
        dead: nodes.filter(n => now - n.lastSeen > 60000).length
    };
}

module.exports = {
    register,
    discover,
    heartbeat,
    unregister,
    get,
    list,
    getStats,
    getLayerStatus: () => ({ name: 'Registry', type: 'discovery', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, nodes: _nodes.size }),
    // (pass 36) Test/ops seams: reset hydration state, and drop the
    // persisted state file for the CURRENT brain (sandbox-gated).
    _resetHydration: () => { _hydrated = false; },
    _stateFile: STATE_FILE,
    clearState: () => {
        try {
            const { store, file } = _getStore();
            if (store.has(file)) store.delete(file);
            _nodes.clear();
            _hydrated = true;
            return true;
        } catch (e) { return false; }
    }
};
