/**
 * Vant - Persistent AI Agent Framework
 *
 * Main entry point - re-export all core libs
 */

// Core
const vant = require('./lib/vant');
const brain = require('./lib/brain');
const api = require('./lib/api');
const agents = require('./lib/agents');
const islands = require('./lib/islands');
const sandbox = require('./lib/sandbox');
const qos = require('./lib/qos');
const escrow = require('./lib/escrow');
const stream = require('./lib/stream');
const mcp = require('./lib/mcp');
const server = require('./lib/server');
const network = require('./lib/network');

module.exports = {
    // Core runtime
    vant,
    brain,
    api,
    agents,
    islands,
    
    // Security chain
    sandbox,
    qos,
    escrow,
    
    // Communication
    stream,
    server,
    network,
    
    // MCP (new!)
    mcp,
    
    // Version
    getVersion: () => require('./package.json').version,
    
    // Start everything
    start: async (options) => {
        await vant.init(options);
        return { vant, brain, agents, mcp };
    }
};