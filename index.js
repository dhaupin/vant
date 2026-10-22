/**
 * Vant - Persistent AI Agent Framework
 *
 * Main entry point - re-export all core libs
 */

// Core
const vant = require('./lib/vant');
const brain = require('./lib/brain');
const search = require('./lib/search');
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
const pipeline = require('./lib/pipeline');
const format = require('./lib/format');
const legal = require('./lib/legal');  // Emergency red button
const memory = require('./lib/memory');  // Memory system
const storage = require('./lib/storage');  // Storage facade (mind layers: brain/state/file/...)


module.exports = {
    // Core runtime
    vant,
    brain,
    search,
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

    // Memory system
    memory,
    storage,

    
    // Communication
    stream,
    server,
    network,
    
    // MCP (new!)
    mcp,
    
    // Boot (for manual layer control)
    boot,
    
    // Runtime operator (lifecycle + config gates)
    pipeline,
    
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
    
    // The documented programmatic memory surface (runtime.md, api-runtime.md,
    // custom-island.md, and the RAG tutorial all write require('vant').think
    // / .init / .learn on the package import):
    init: vant.init,
    think: vant.think,
    learn: vant.learn,
    remember: vant.remember,
    
    // Individual starts
    startMCP: (port) => mcp.start({ port }),
    startBoot: (opts) => boot.init(opts)
};