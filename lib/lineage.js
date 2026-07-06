/**
 * Lineage (v0.8.6)
 * WITH EVENT EMISSIONS - lineage recording emits globally
 * Track object origins + relationships
 * 
 * Usage:
 *   const lineage = require('./lineage');
 *   lineage.record('doc_123', { source: 'brain', type: 'note' });
 *   const trace = lineage.trace('doc_123');
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

const _lineage = new Map();
const _traces = new Map();
let _idCounter = 0;

/**
 * Record lineage for an object
 * @param {string} id - Object ID
 * @param {Object} options - { source, type, parent, metadata, workspace }
 */
function record(id, { source, type, parent, metadata = {}, workspace = null }) {
    // Get workspace from habitat if not provided
    if (!workspace) {
        try {
            const habitat = require('./habitat');
            if (habitat?.getCurrentWorkspace) {
                workspace = habitat.getCurrentWorkspace();
            }
        } catch (e) {
            // Habitat not available
        }
    }
    
    const entry = {
        id,
        source,
        type,
        parent: parent || null,
        metadata,
        workspace,  // Workspace context for multi-tenant isolation
        created: Date.now(),
        lineageId: ++_idCounter
    };
    _lineage.set(id, entry);
    
    // EVENT: lineage recorded
    _emit('lineage:recorded', { id, source, type, workspace, timestamp: Date.now() });
    
    // Build trace tree
    if (parent) {
        const parentEntry = _lineage.get(parent);
        if (parentEntry) {
            const trace = _traces.get(id) || [];
            trace.push(parentEntry);
            _traces.set(id, trace);
        }
    }
    
    return entry;
}

/**
 * Trace ancestry of an object
 */
function trace(id) {
    const entry = _lineage.get(id);
    if (!entry) return null;
    
    const ancestors = [];
    let current = entry;
    while (current && current.parent) {
        const parentEntry = _lineage.get(current.parent);
        if (parentEntry) {
            ancestors.push(parentEntry);
            current = parentEntry;
        } else {
            break;
        }
    }
    
    return { entry, ancestors };
}

/**
 * Get all children of an object
 */
function children(id) {
    const kids = [];
    for (const [key, entry] of _lineage) {
        if (entry.parent === id) {
            kids.push(entry);
        }
    }
    return kids;
}

/**
 * Get lineage stats
 */
function getStats() {
    // Count by type and source
    const types = {};
    const sources = {};
    const workspaces = {};
    
    for (const entry of _lineage.values()) {
        types[entry.type] = (types[entry.type] || 0) + 1;
        sources[entry.source] = (sources[entry.source] || 0) + 1;
        if (entry.workspace) {
            workspaces[entry.workspace] = (workspaces[entry.workspace] || 0) + 1;
        }
    }
    
    return {
        total: _lineage.size,
        traces: _traces.size,
        types,
        sources,
        workspaces
    };
}

/**
 * Trace lineage for objects in a specific workspace
 * Filters lineage by workspace for multi-tenant isolation
 */
function traceForWorkspace(workspaceId) {
    const results = [];
    
    for (const entry of _lineage.values()) {
        if (entry.workspace === workspaceId) {
            results.push(entry);
        }
    }
    
    return results;
}

module.exports = {
    record,
    trace,
    children,
    getStats,
    traceForWorkspace,
    getLayerStatus: () => ({ name: 'Lineage', type: 'tracking', version: '0.9.0', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, total: _lineage.size })
};