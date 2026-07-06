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
const boot = require('./lib/boot');
const runop = require('./lib/runop');
const format = require('./lib/format');
const legal = require('./lib/legal');  // Emergency red button

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
    
    // Utilities
    format,
    legal,  // Emergency red button
    
    // Communication
    stream,
    server,
    network,
    
    // MCP (new!)
    mcp,
    
    // Boot (for manual layer control)
    boot,
    
    // Runtime operator (lifecycle + config gates)
    runop,
    
    // Version
    getVersion: () => require('./package.json').version,
    
    // Start everything (full runtime)
    start: vant.startFull,
    
    // Shutdown gracefully
    shutdown: vant.shutdown,
    sleep: vant.sleep,
    wake: vant.wake,
    dream: vant.dream,
    
    // Get status
    getStatus: vant.getStatus,
    
    // Individual starts
    startMCP: (port) => mcp.start({ port }),
    startBoot: (opts) => boot.init(opts)
};