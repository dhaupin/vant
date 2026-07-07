/**
 * Vant - Persistent AI Agent Framework
 *
 * Main entry point - re-export all core libs
 * Flat namespace: all exports are at vant.* level
 */

// Core lib - get sandbox function for override
const vantLib = require('./lib/vant');
const brain = require('./lib/brain');
const search = require('./lib/search');
const api = require('./lib/api');
const agents = require('./lib/agents');
const islands = require('./lib/islands');
const qos = require('./lib/qos');
const escrow = require('./lib/escrow');
const stream = require('./lib/stream');
const mcp = require('./lib/mcp');
const server = require('./lib/server');
const network = require('./lib/network');
const boot = require('./lib/boot');
const runop = require('./lib/runop');
const format = require('./lib/format');
const legal = require('./lib/legal');  // Emergency red button

// Build exports - flatten everything to vant.*
module.exports = {
    // Spread all from vant lib (brain, search, islands, etc)
    ...vantLib,
    
    // Override sandbox with getSandbox function
    sandbox: vantLib.sandbox,
    
    // Additional libs not in vantLib
    brain,
    search,
    api,
    agents,
    islands,
    qos,
    escrow,
    stream,
    server,
    network,
    mcp,
    boot,
    runop,
    format,
    legal,
    
    // Version
    getVersion: () => require('./package.json').version,
    
    // Start wrappers
    start: vantLib.startFull,
    startMCP: (port) => mcp.start({ port }),
    startBoot: (opts) => boot.init(opts)
};