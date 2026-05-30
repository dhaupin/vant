/**
 * System Status - Consolidated OS Dashboard (v0.8.7)
 * WITH EVENT EMISSIONS - system operations emit globally
 * 
 * Single source of truth for all layer 3 services.
 * Extended with: event wiring, boot layers, runtime metrics, module discovery
 * 
 * Usage:
 *   const system = require('./system');
 *   system.status() → { compute, embed, storage, network, agents, ... }
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

const fs = require('fs');

/**
 * Get system status - all services in one place
 */
function status() {
    const s = {
        version: null,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {},
        boot: {},       // NEW: Boot layer status
        events: {},     // NEW: Event wiring status
        discovery: {}  // NEW: Module discovery
    };
    
    // Version
    try {
        s.version = require('../package.json').version;
    } catch (e) {}
    
    // === BOOT LAYERS (NEW - now with events!) ===
    try {
        const boot = require('./boot');
        if (boot.getBootState) {
            const bs = boot.getBootState();
            s.boot = {
                initialized: bs.initialized,
                layers: bs.layers,  // Full layer stack visible!
                taskId: bs.taskId,
                error: bs.error
            };
        } else if (boot.getLayerStatus) {
            s.boot = boot.getLayerStatus();
        }
    } catch (e) {
        s.boot = { status: 'error', message: e.message };
    }
    
    // === MODULE DISCOVERY (NEW) ===
    try {
        const vant = require('./vant');
        if (vant.buildRegistry) {
            const reg = vant.buildRegistry();
            s.discovery = {
                modules: reg.modules.size,
                capabilities: reg.byCapability.size,
                byCapability: Object.fromEntries(reg.byCapability)
            };
        }
    } catch (e) {
        s.discovery = { status: 'error', message: e.message };
    }
    
    // === EVENTS (Enhanced) ===
    try {
        const event = require('./event');
        const evtStats = event.defaultEvent?.stats?.() || event.stats?.() || {};
        s.events = { 
            status: 'ok',
            listeners: evtStats.events || 0,
            uptime: evtStats.uptime
        };
    } catch (e) {
        s.events = { status: 'error', message: e.message };
    }
    
    // === EXISTING SERVICES (unchanged) ===
    
    // Compute
    try {
        const compute = require('./compute');
        s.services.compute = {
            status: 'ok',
            available: compute.status().available
        };
    } catch (e) {
        s.services.compute = { status: 'error', message: e.message };
    }
    
    // Embed
    try {
        s.services.embed = {
            status: 'ok',
            dims: 384,
            cosineSimilarity: true
        };
    } catch (e) {
        s.services.embed = { status: 'error', message: e.message };
    }
    
    // Storage
    try {
        const storage = require('./storage');
        s.services.storage = {
            status: 'ok',
            type: storage.type || 'file'
        };
    } catch (e) {
        s.services.storage = { status: 'error', message: e.message };
    }
    
    // Network
    try {
        const network = require('./network');
        const health = network.healthCheck?.() || { status: 'ok' };
        s.services.network = {
            status: health.status,
            latency: health.latency
        };
    } catch (e) {
        s.services.network = { status: 'error', message: e.message };
    }
    
    // Brain
    try {
        const brain = require('./brain');
        s.services.brain = {
            status: 'ok'
        };
    } catch (e) {
        s.services.brain = { status: 'error', message: e.message };
    }
    
    // MCP
    try {
        const mcp = require('./mcp');
        s.services.mcp = {
            status: 'ok',
            tools: mcp.listTools?.()?.length || 0
        };
    } catch (e) {
        s.services.mcp = { status: 'error', message: e.message };
    }
    
    // Cron (scheduled tasks)
    try {
        const cron = require('./cron');
        const list = cron.list?.() || [];
        s.services.cron = {
            status: 'ok',
            tasks: list.length
        };
    } catch (e) {
        s.services.cron = { status: 'error', message: e.message };
    }
    
    // Agents (multi-agent)
    try {
        const agents = require('./agents');
        const agentList = agents.list?.() || [];
        s.services.agents = {
            status: 'ok',
            count: agentList.length
        };
    } catch (e) {
        s.services.agents = { status: 'error', message: e.message };
    }
    
    // Search (brain search)
    try {
        const search = require('./search');
        s.services.search = {
            status: 'ok',
            modes: search.modes || ['basic', 'semantic']
        };
    } catch (e) {
        s.services.search = { status: 'error', message: e.message };
    }
    
    // Audit (logging)
    try {
        const audit = require('./audit');
        s.services.audit = { status: 'ok' };
    } catch (e) {
        s.services.audit = { status: 'error', message: e.message };
    }
    
    // Auth (authentication)
    try {
        const auth = require('./auth');
        s.services.auth = { status: 'ok' };
    } catch (e) {
        s.services.auth = { status: 'error', message: e.message };
    }
    
    // Cache (in-memory)
    try {
        const cache = require('./cache');
        s.services.cache = { status: 'ok' };
    } catch (e) {
        s.services.cache = { status: 'error', message: e.message };
    }
    
    // Event (PubSub)
    try {
        const event = require('./event');
        s.services.event = { status: 'ok' };
    } catch (e) {
        s.services.event = { status: 'error', message: e.message };
    }
    
    // Msg (messaging)
    try {
        const msg = require('./msg');
        s.services.msg = { status: 'ok' };
    } catch (e) {
        s.services.msg = { status: 'error', message: e.message };
    }
    
    // Security (layer)
    try {
        const security = require('./security');
        s.services.security = { status: 'ok' };
    } catch (e) {
        s.services.security = { status: 'error', message: e.message };
    }
    
    // Metrics (instrumentation)
    try {
        const metrics = require('./metrics');
        const stats = metrics.getStats();
        s.services.metrics = {
            status: 'ok',
            counters: Object.keys(stats.counters).length,
            gauges: Object.keys(stats.gauges).length,
            timings: Object.keys(stats.timings).length,
            uptime: stats.uptime
        };
    } catch (e) {
        s.services.metrics = { status: 'error', message: e.message };
    }
    
    // Config (settings)
    try {
        const config = require('./config');
        s.services.config = { status: 'ok' };
    } catch (e) {
        s.services.config = { status: 'error', message: e.message };
    }
    
    // Sync (brain sync)
    try {
        const sync = require('./sync');
        s.services.sync = { status: 'ok' };
    } catch (e) {
        s.services.sync = { status: 'error', message: e.message };
    }
    
    // Remote (distributed)
    try {
        const remote = require('./remote');
        s.services.remote = { status: 'ok' };
    } catch (e) {
        s.services.remote = { status: 'error', message: e.message };
    }
    
    // Lineage (tracking)
    try {
        const lineage = require('./lineage');
        s.services.lineage = { status: 'ok' };
    } catch (e) {
        s.services.lineage = { status: 'error', message: e.message };
    }
    
    // Schema (validation)
    try {
        const schema = require('./schema');
        s.services.schema = { status: 'ok' };
    } catch (e) {
        s.services.schema = { status: 'error', message: e.message };
    }
    
    // Rules (policy)
    try {
        const rules = require('./rules');
        s.services.rules = { status: 'ok' };
    } catch (e) {
        s.services.rules = { status: 'error', message: e.message };
    }
    
    // Registry (peer discovery)
    try {
        const registry = require('./node-registry');
        const stats = registry.getStats();
        s.services.registry = { status: 'ok', nodes: stats.total };
    } catch (e) {
        s.services.registry = { status: 'error', message: e.message };
    }
    
    // Consensus (voting)
    try {
        const consensus = require('./consensus');
        const stats = consensus.getStats();
        s.services.consensus = { status: 'ok', protected: true, votes: stats.total };
    } catch (e) {
        s.services.consensus = { status: 'error', message: e.message };
    }
    
    // EVENT: system status checked
    _emit('system:status', { version: s.version, uptime: s.uptime, timestamp: s.timestamp });
    
    return s;
}

/**
 * Quick health - boolean OK/ERROR
 */
function healthy() {
    const s = status();
    return Object.values(s.services).every(svc => svc.status === 'ok');
}

// Framework interface
function getLayerStatus() {
    return { name: 'System', type: 'dashboard', version: '0.8.6', enabled: true };
}

function isOperationAllowed(operation) {
    return { allowed: true, layer: 'System' };
}

module.exports = {
    status,
    healthy,
    getLayerStatus,
    isOperationAllowed,
    getStatus: () => ({ enabled: true })
};