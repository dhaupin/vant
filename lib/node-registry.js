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
 * (pass 36, refactored pass 37 / prd-vant-os) PERSISTENT — the peer
 * table hydrates from models/private/<brain>/state/node-registry.json
 * on first touch and writes through on every mutation, via the shared
 * lib/state-store.js (arch A rules: read-denial throws E_STATE_READ,
 * corruption warns + fresh). This file is consensus's vote-verification
 * anchor, so losing it on restart broke the whole protocol layer.
 */

const stateStore = require('./state-store');

const STATE_FILE = 'state/node-registry.json';
let _hydrated = false;

function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    stateStore.hydrate({
        moduleName: 'node-registry',
        stateFile: STATE_FILE,
        apply: (snapshot) => {
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
    });
}

function _persist() {
    stateStore.persist({
        moduleName: 'node-registry',
        stateFile: STATE_FILE,
        data: { nodes: Array.from(_nodes.values()) }
    });
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
    // (pass 36/37) Test/ops seams: reset hydration state, and drop the
    // persisted state file for the CURRENT brain (sandbox-gated).
    _resetHydration: () => { _hydrated = false; },
    _stateFile: STATE_FILE,
    clearState: () => {
        stateStore.clear(STATE_FILE);
        _nodes.clear();
        _hydrated = true;
        return true;
    }
};
