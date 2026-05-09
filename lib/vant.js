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

// ==================== CORE MODULES ====================
// Lazy-loaded for performance
let _brain = null;
let _search = null;
let _islands = null;
let _config = null;
let _configModule = null;
let _cache = null;
let _lock = null;
let _audit = null;

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

const getCompression = getMemoize; // Unified cache handles compression too

// ==================== NEW OS MODULES (Phase 1) ====================
let _vectorStore = null;
let _cron = null;
let _conversation = null;
let _agents = null;
let _ipc = null;
let _encrypt = null;
let _stego = null;
let _qos = null;

const getVectorStore = () => {
    if (!_vectorStore) _vectorStore = require('./vector-store');
    return _vectorStore;
};

const getCron = () => {
    if (!_cron) _cron = require('./cron');
    return _cron;
};

const getConversation = () => {
    if (!_conversation) _conversation = require('./conversation');
    return _conversation;
};

const getAgents = () => {
    if (!_agents) _agents = require('./agents');
    return _agents;
};

const getIpc = () => {
    if (!_ipc) _ipc = require('./ipc');
    return _ipc;
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
    enabled: true
};

/**
 * Initialize agent
 */
async function init(options = {}) {
    const { name = 'Vant', role = 'AI Agent', id = null } = options;
    
    AGENT_STATE.id = id || generateId();
    AGENT_STATE.name = name;
    AGENT_STATE.role = role;
    AGENT_STATE.session = Date.now();
    
    // Load identity
    const identity = getBrain().getIdentity();
    if (identity) {
        AGENT_STATE.name = identity.name || AGENT_STATE.name;
        AGENT_STATE.role = identity.role || AGENT_STATE.role;
    }
    
    // Cache identity in memoize
    getMemoize().set('agent:identity', AGENT_STATE, 3600000);
    
    return AGENT_STATE;
}

/**
 * Generate unique ID
 */
function generateId() {
    return 'agent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    
    // Write to brain
    brain.write(key, content);
    
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
        components: 14
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
    conversation: () => getConversation(),
    agents: () => getAgents(),
    ipc: () => getIpc(),
    encrypt: getEncrypt,
    stego: getStego,
    qos: getQoS,
    
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
        get conversation() { return getConversation(); }
        get agents() { return getAgents(); }
        get ipc() { return getIpc(); }
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
module.exports.getTools = getTools;
module.exports.executeTool = executeTool;
module.exports.Tools = { getTools, executeTool };
