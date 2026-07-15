/**
 * Node Registry (v0.8.6)
 * WITH EVENT EMISSIONS - peer events emit globally
 * Peer discovery for distributed agents
 * 
 * Usage:
 *   const registry = require('./registry');
 *   registry.register({ host: 'localhost', port: 3100 });
 *   const peers = registry.discover();
 */

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
    
    for (const [id, node] of _nodes) {
        if (now - node.lastSeen > timeout) continue;
        if (filters.status && node.status !== filters.status) continue;
        if (filters.name && node.name !== filters.name) continue;
        peers.push(node);
    }
    
    return peers;
}

// Heartbeat
function heartbeat(nodeId) {
    const node = _nodes.get(nodeId);
    if (node) {
        node.lastSeen = Date.now();
        node.status = 'alive';
    }
    return node;
}

// Unregister
function unregister(nodeId) {
    return _nodes.delete(nodeId);
}

// Get node
function get(nodeId) {
    return _nodes.get(nodeId);
}

// All nodes
function list() {
    return Array.from(_nodes.values());
}

// Stats
function getStats() {
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
    getLayerStatus: () => ({ name: 'Registry', type: 'discovery', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, nodes: _nodes.size })
};