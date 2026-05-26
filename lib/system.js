/**
 * System Status - Consolidated OS Dashboard
 * 
 * Single source of truth for all layer 3 services.
 * Used by: health checks, monitoring, debugging.
 * 
 * Usage:
 *   const system = require('./system');
 *   system.status() → { compute, embed, storage, network, agents, ... }
 */

const fs = require('fs');

/**
 * Get system status - all services in one place
 */
function status() {
    const s = {
        version: null,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {}
    };
    
    // Version
    try {
        s.version = require('../package.json').version;
    } catch (e) {}
    
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
    
    return s;
}

/**
 * Quick health - boolean OK/ERROR
 */
function healthy() {
    const s = status();
    return Object.values(s.services).every(svc => svc.status === 'ok');
}

module.exports = {
    status,
    healthy
};