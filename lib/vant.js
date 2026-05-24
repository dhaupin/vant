/**
 * Vant Runtime (v0.8.6)
 * AI-first agent execution environment
 * 
 * What I need as an agent:
 * - Memory: brain + search + islands
 * - Think: query, reason, decide
 * - Act: execute operations
 * - State: remember across sessions
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ==================== CORE MODULES ====================
// Lazy-loaded for performance
let _storage = null;
let _search = null;
let _islands = null;
let _config = null;
let _configModule = null;
let _cache = null;
let _lock = null;
let _audit = null;

const getStorage = () => {
    if (!_storage) _storage = require('./storage');
    return _storage;
};

// Brain router - unified loading with mode switch
let _brain = null;
const getBrain = () => {
    if (!_brain) _brain = require('./brain');
    return _brain;
};

const getSearch = () => {
    if (!_search) _search = require('./search');
    return _search;
};

const getIslands = () => {
    if (!_islands) _islands = require('./islands');
    return _islands;
};

const getConfig = () => {
    if (!_config) _configModule = require('./config');
    return _configModule;
};

const getMemoize = () => {
    if (!_cache) _cache = require('./cache');
    return _cache;
};

const getLock = () => {
    if (!_lock) _lock = require('./lock');
    return _lock;
};

const getAudit = () => {
    if (!_audit) _audit = require('./audit');
    return _audit;
};

const getCompression = getMemoize;

// ==================== NEW OS MODULES (Phase 1) ====================
let _vectorStore = null;
let _cron = null;
let _encrypt = null;
let _stego = null;
let _qos = null;

let _agents = null;
let _msg = null;

const getAgents = () => {
    if (!_agents) _agents = require('./agents');
    return _agents;
};

const getMsg = () => {
    if (!_msg) _msg = require('./msg');
    return _msg;
};

// NEW: Runtime operator
let _runop = null;
const getRunop = () => {
    if (!_runop) _runop = require('./runop');
    return _runop;
};

// NEW: Add missing system getters
let _citations = null;
let _connector = null;
let _framework = null;

const getCitations = () => {
    if (!_citations) _citations = require('./citations');
    return _citations;
};

const getConnector = () => {
    if (!_connector) _connector = require('./connector');
    return _connector;
};

const getFramework = () => {
    if (!_framework) _framework = require('./framework');
    return _framework;
};

const getVectorStore = () => {
    if (!_vectorStore) _vectorStore = require('./storage').get('vector');
    return _vectorStore;
};

const getCron = () => {
    if (!_cron) _cron = require('./cron');
    return _cron;
};

const getEncrypt = () => {
    if (!_encrypt) _encrypt = require('./encrypt');
    return _encrypt;
};

const getStego = () => {
    if (!_stego) _stego = require('./stego');
    return _stego;
};

const getQoS = () => {
    if (!_qos) _qos = require('./qos');
    return _qos;
};

let _network;
const getNetwork = () => {
    if (!_network) _network = require('./network');
    return _network;
};

let _sandbox;
const getSandbox = () => {
    if (!_sandbox) _sandbox = require('./sandbox');
    return _sandbox;
};

// ==================== AGENT STATE ====================

const AGENT_STATE = {
    id: null,
    name: 'Vant',
    role: 'AI Agent',
    version: '0.8.6',
    session: null,
    context: null,
    goals: [],
    memory: [],
    tools: [],
    enabled: true,
    status: 'stopped'  // stopped | starting | running | stopping
};

/**
 * Initialize agent
 */
async function init(options = {}) {
    const { name = 'Vant', role = 'AI Agent', id = null, debug = false } = options;
    
    // State machine: stopped → starting
    if (AGENT_STATE.status !== 'stopped') {
        return { error: 'Already ' + AGENT_STATE.status, state: AGENT_STATE };
    }
    AGENT_STATE.status = 'starting';
    
    // Wire boot.init() first - initializes all security layers
    const config = getConfig();
    const bootOpts = {
        taskId: id || generateId(),
        scopes: options.scopes || ['read', 'write', 'exec', 'network'],
        debug
    };
    
    // Try boot.init() - if it exists and not yet initialized
    try {
        const boot = require('./boot');
        if (boot.init && !boot.isInitialized()) {
            if (debug) console.log('[vant] Running boot.init()...');
            await boot.init(bootOpts);
        }
    } catch (e) {
        if (debug) console.log('[vant] boot.init() skipped:', e.message);
    }
    
    // Set agent state
    AGENT_STATE.id = id || generateId();
    AGENT_STATE.name = name;
    AGENT_STATE.role = role;
    AGENT_STATE.session = Date.now();
    
    // Load identity from brain
    const identity = getBrain().getIdentity();
    if (identity) {
        AGENT_STATE.name = identity.name || AGENT_STATE.name;
        AGENT_STATE.role = identity.role || AGENT_STATE.role;
    }
    
    // Cache identity in memoize
    getMemoize().set('agent:identity', AGENT_STATE, 3600000);
    
    // State machine: starting → running
    AGENT_STATE.status = 'running';
    
    return AGENT_STATE;
}

/**
 * Generate unique ID
 */
function generateId() {
    return 'agent_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// ==================== THINK ====================

/**
 * Query brain - main thinking operation
 * @param {string} query - What to think about
 * @param {Object} opts - {topK, maxTokens}
 * @returns {Object} {memories, insights, context}
 */
async function think(query, opts = {}) {
    const { topK = 10, maxTokens = 2000 } = opts;
    
    // Step 1: Detect what islands are needed
    const triggers = getIslands().findTriggers(query);
    
    // Step 2: Query brain
    const brainResult = await getSearch().queryBrain(query, {
        topK,
        maxTokens
    });
    
    // Step 3: Hydrate relevant islands
    const islandData = triggers.length > 0 
        ? getIslands().autoHydrate(query)
        : [];
    
    // Step 4: Build context
    const insights = brainResult.memories.map(m => ({
        id: m.id,
        title: m.title,
        relevance: m.rerankScore || 0,
        preview: m.content?.slice(0, 100)
    }));
    
    return {
        query,
        triggers,
        insights,
        memories: brainResult.memories,
        islands: islandData,
        tokens: brainResult.stats?.estimatedTokens || 0,
        agent: AGENT_STATE.name
    };
}

/**
 * Learn new information
 */
async function learn(key, content) {
    const brain = getBrain();
    
    // Parse key as category/key
    const parts = key.split('/');
    const category = parts[0] || 'learnings';
    const fileKey = parts.slice(1).join('/') || 'default.md';
    
    // Write to brain
    brain.write(category, fileKey, content);
    
    // Memoize for fast recall
    getMemoize().set('learn:' + key, content, 86400000);
    
    // Log to audit
    getAudit().log({
        type: 'learn',
        key,
        agent: AGENT_STATE.id
    });
    
    return { success: true, key };
}

/**
 * Remember across sessions
 */
async function remember(key, content) {
    if (content) {
        // Store
        getMemoize().set('memory:' + key, content, -1); // Never expire
        getBrain().append(key, content);
        return { success: true, key, content };
    } else {
        // Recall
        return getMemoize().get('memory:' + key);
    }
}

// ==================== ACT ====================

/**
 * Execute operation with guards
 */
async function act(operation, options = {}) {
    const { timeout = 30000, retries = 0 } = options;
    
    const startTime = Date.now();
    
    // Acquire lock
    const lock = getLock().acquire(AGENT_STATE.id, 10000);
    if (!lock) {
        return { error: 'Locked', code: 'LOCKED' };
    }
    
    try {
        // Execute
        const result = typeof operation === 'function' 
            ? await operation()
            : operation;
        
        // Audit
        getAudit().log({
            type: 'act',
            operation: operation.name || 'anonymous',
            duration: Date.now() - startTime,
            agent: AGENT_STATE.id
        });
        
        return { success: true, result, duration: Date.now() - startTime };
        
    } catch (e) {
        return { error: e.message, code: 'ERROR' };
    } finally {
        getLock().release(AGENT_STATE.id);
    }
}

/**
 * Execute with retries
 */
async function actWithRetry(operation, options = {}) {
    const { retries = 3, backoff = 1000 } = options;
    
    let lastError = null;
    for (let i = 0; i <= retries; i++) {
        try {
            return await act(operation);
        } catch (e) {
            lastError = e;
            if (i < retries) await sleep(backoff * Math.pow(2, i));
        }
    }
    return { error: lastError.message, code: 'RETRY_EXHAUSTED' };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== STATE ====================

/**
 * Get current agent state
 */
function getState() {
    return {
        ...AGENT_STATE,
        uptime: AGENT_STATE.session ? Date.now() - AGENT_STATE.session : 0,
        memoizeSize: getMemoize().size(),
        lockStatus: getLock().status
    };
}

/**
 * Get system status
 */
function getStatus() {
    let cfg = null;
    try {
        const config = getConfig();
        cfg = config && config.get ? config.get() : null;
    } catch (e) {
        // Config not loaded
    }
    return {
        agent: AGENT_STATE.name,
        version: AGENT_STATE.version,
        enabled: AGENT_STATE.enabled,
        brain: getBrain().getVersion(),
        search: getSearch().getSummary(),
        islands: getIslands().getSummary(),
        config: cfg ? 'prod' : 'dev'
    };
}

/**
 * Get layer status for framework reporting
 */
function getLayerStatus() {
    return {
        name: 'Vant',
        type: 'agent-runtime',
        version: '0.8.6',
        enabled: AGENT_STATE.enabled,
        components: 14,
        status: AGENT_STATE.status
    };
}

/**
 * Shutdown agent gracefully
 */
async function shutdown(options = {}) {
    const { force = false, debug = false } = options;
    
    if (AGENT_STATE.status === 'stopped') {
        return { alreadyStopped: true };
    }
    
    if (AGENT_STATE.status !== 'running' && !force) {
        return { error: 'Cannot shutdown in state: ' + AGENT_STATE.status };
    }
    
    AGENT_STATE.status = 'stopping';
    
    try {
        // Close MCP server
        try {
            const mcp = require('./mcp');
            if (mcp.stop) {
                if (debug) console.log('[vant] Stopping MCP server...');
                await mcp.stop();
            }
        } catch (e) {
            if (debug) console.log('[vant] MCP stop skipped:', e.message);
        }
        
        // Reset boot
        try {
            const boot = require('./boot');
            if (boot.reset) {
                if (debug) console.log('[vant] Resetting boot...');
                await boot.reset();
            }
        } catch (e) {
            if (debug) console.log('[vant] boot.reset skipped:', e.message);
        }
        
        AGENT_STATE.status = 'stopped';
        AGENT_STATE.id = null;
        AGENT_STATE.session = null;
        
        return { shutdown: true };
        
    } catch (e) {
        AGENT_STATE.status = 'stopped';
        return { error: e.message };
    }
}

/**
 * Full start - boot → event → cron → msg → mcp
 * Run this to get a fully running Vant system
 */
async function startFull(options = {}) {
    const { 
        mcpPort = null,
        debug = false,
        taskId = null 
    } = options;
    
    // Already running?
    if (AGENT_STATE.status === 'running') {
        return { error: 'Already running', status: AGENT_STATE.status };
    }
    
    if (debug) console.log('[vant] Starting full runtime...');
    
    // Step 1: Init agent (includes boot.init())
    await init({ taskId, debug });
    
    // Step 2: Start MCP server
    try {
        const config = getConfig();
        const port = mcpPort || config.get('mcp.port') || 3100;
        
        if (debug) console.log('[vant] Starting MCP on port', port);
        const mcp = require('./mcp');
        await mcp.start({ port });
    } catch (e) {
        if (debug) console.log('[vant] MCP start error:', e.message);
    }
    
    // Step 3: Initialize event system (ready for pub/sub)
    try {
        if (debug) console.log('[vant] Initializing events...');
        const event = require('./event');
        // Event is singleton, just accessing it ready
        event.getStatus?.();
    } catch (e) {
        if (debug) console.log('[vant] Event init skipped:', e.message);
    }
    
    // Step 4: Initialize msg (ready for agent comms)
    try {
        if (debug) console.log('[vant] Initializing msg...');
        const msg = require('./msg');
        msg.getStatus?.();
    } catch (e) {
        if (debug) console.log('[vant] Msg init skipped:', e.message);
    }
    
    return {
        started: true,
        status: AGENT_STATE.status,
        id: AGENT_STATE.id,
        session: AGENT_STATE.session
    };
}

/**
 * Check if operation is allowed
 */
function isOperationAllowed(operation) {
    return { allowed: true, layer: 'Vant', operation };
}

// ==================== EXPORTS ====================

module.exports = {
    // Core
    init,
    startFull,
    shutdown,
    think,
    learn,
    remember,
    act,
    actWithRetry,
    
    // State
    getState,
    getStatus,
    
    // Re-export for direct access
    brain: () => getBrain(),
    search: () => getSearch(),
    islands: () => getIslands(),
    config: getConfig,
    memoize: () => getMemoize(),
    cache: () => getMemoize(),     // Unified cache
    compression: () => getMemoize(), // Unified cache handles compression too
    lock: () => getLock(),
    audit: () => getAudit(),
    
    // NEW OS MODULES (Phase 1) - shortucts to systems
    vectorStore: () => getVectorStore(),
    cron: () => getCron(),
    msg: () => getMsg(),
    agents: () => getAgents(),
    runop: () => getRunop(),
    encrypt: getEncrypt,
    stego: getStego,
    qos: getQoS,
    network: getNetwork,
    sandbox: getSandbox,
    event: require('./event'), // Unified Event (Event + PubSub + Queue)
    
    // The Vant Class - Ultimate agent
    Vant: class {
        constructor(options = {}) {
            this._state = { ...AGENT_STATE, ...options };
            this._initialized = false;
        }
        async init(opts) {
            if (opts) Object.assign(this._state, opts);
            const result = await init(this._state);
            this._initialized = true;
            return result;
        }
        async think(query, opts) {
            return think(query, opts);
        }
        async learn(key, content) {
            return learn(key, content);
        }
        async remember(key, content) {
            return remember(key, content);
        }
        async act(operation, opts) {
            return act(operation, opts);
        }
        getState() {
            return getState();
        }
        getStatus() {
            return getStatus();
        }
        getLayerStatus() {
            return getLayerStatus();
        }
        isOperationAllowed(op) {
            return isOperationAllowed(op);
        }
        // Direct access to all modules
        get brain() { return getBrain(); }
        get search() { return getSearch(); }
        get islands() { return getIslands(); }
        get config() { return getConfig(); }
        get memoize() { return getMemoize(); }
        get lock() { return getLock(); }
        get audit() { return getAudit(); }
        get compression() { return getCompression(); }
        get vectorStore() { return getVectorStore(); }
        get cron() { return getCron(); }
        get msg() { return getMsg(); }
        get agents() { return getAgents(); }
        get encrypt() { return getEncrypt(); }
        get stego() { return getStego(); }
        get qos() { return getQoS(); }
    },
    
    // Legacy alias
    Runtime: class {
        constructor(options = {}) {
            this._state = { ...AGENT_STATE, ...options };
        }
        async init() {
            return init(this._state);
        }
        async think(query, opts) {
            return think(query, opts);
        }
        getStatus() {
            return getStatus();
        }
    },
    
    getLayerStatus: () => ({ name: 'Runtime', type: 'runtime', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'Runtime' }),
    getStatus: () => ({ enabled: true })
};

// ==================== TOOLS ====================

/**
 * Get available tools
 */
function getTools() {
    return [
        { name: 'think', description: 'Query brain for context' },
        { name: 'learn', description: 'Store new information' },
        { name: 'remember', description: 'Remember across sessions' },
        { name: 'act', description: 'Execute operation with locks' },
        { name: 'search', description: 'Search brain memories' },
        { name: 'brain', description: 'Direct brain access' },
    ];
}

/**
 * Execute tool by name
 */
async function executeTool(toolName, args = {}) {
    const tools = {
        think: () => think(args.query, args.opts),
        learn: () => learn(args.key, args.content),
        remember: () => remember(args.key, args.content),
        act: () => act(args.operation, args.opts),
        search: () => getSearch().queryBrain(args.query, args.opts),
        brain: () => getBrain().get(args.key),
    };
    
    const tool = tools[toolName];
    if (!tool) {
        return { error: 'Unknown tool: ' + toolName };
    }
    
    return tool();
}

// Attach to exports
module.exports.brain = getBrain;
module.exports.storage = getStorage;
module.exports.search = getSearch;
module.exports.islands = getIslands;
module.exports.config = getConfig;
module.exports.cache = getMemoize;
module.exports.lock = getLock;
module.exports.audit = getAudit;
module.exports.getTools = getTools;
module.exports.executeTool = executeTool;
module.exports.Tools = { getTools, executeTool };

// Agents + Messaging
module.exports.agents = getAgents;
module.exports.msg = getMsg;

// NEW: Missing systems
module.exports.citations = getCitations;
module.exports.connector = getConnector;
module.exports.framework = getFramework;

// Core functions
module.exports.init = init;
module.exports.think = think;
module.exports.learn = learn;
module.exports.remember = remember;
module.exports.act = act;
module.exports.shutdown = shutdown;
module.exports.getState = getState;
module.exports.getStatus = getStatus;
