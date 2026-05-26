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