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
 */
function record(id, { source, type, parent, metadata = {} }) {
    const entry = {
        id,
        source,
        type,
        parent: parent || null,
        metadata,
        created: Date.now(),
        lineageId: ++_idCounter
    };
    _lineage.set(id, entry);
    
    // EVENT: lineage recorded
    _emit('lineage:recorded', { id, source, type, timestamp: Date.now() });
    
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
    return {
        total: _lineage.size,
        traces: _traces.size,
        types: {},
        sources: {}
    };
}

module.exports = {
    record,
    trace,
    children,
    getStats,
    getLayerStatus: () => ({ name: 'Lineage', type: 'tracking', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, total: _lineage.size })
};