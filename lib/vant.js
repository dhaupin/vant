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

const getHabitat = () => {
    return global.__vant_habitat || null;
};

const getNature = () => {
    return global.__vant_nature || null;
};

let _network;
const getNetwork = () => {
    if (!_network) _network = require('./network');
    return _network;
};

let _sandbox;
const getSandbox = () => {
    if (!_sandbox) {
        const sb = require('./sandbox');
        // Return defaultSandbox instance, not the module
        _sandbox = sb.defaultSandbox || sb;
    }
    return _sandbox;
};

// ==================== NEW: EMBED + COMPUTE (Layer 3 Services) ====================
let _embed;
const getEmbed = () => {
    if (!_embed) _embed = require('./embed');
    return _embed;
};

let _compute;
const getCompute = () => {
    if (!_compute) _compute = require('./compute');
    return _compute;
};

// ==================== AGENT STATE ====================

const AGENT_STATE = {
    id: null,
    name: 'Vant',
    role: 'AI Agent',
    version: '0.8.6',  // AI-first runtime with event wiring
    session: null,
    context: null,
    goals: [],
    memory: [],
    tools: [],
    enabled: true,
    status: 'stopped'  // stopped | starting | running | stopping
};

// Event emitter helper for AI-first runtime
let _event = null;
function _emit(type, data) {
    try {
        if (!_event) _event = require('./event');
        if (_event.defaultEvent?.emit) return _event.defaultEvent.emit(type, data);
        if (_event.emit) return _event.emit(type, data);
    } catch (e) { /* silent fail */ }
    return 0;
}

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
    
    // Initialize habitat + nature (environment + flywheel)
    try {
        const Habitat = require('./habitat');
        const Nature = require('./nature');
        
        // Create habitat with brain persistence
        const brain = getBrain();
        const habitat = new Habitat({ persistence: brain });
        
        // Create nature instance
        const nature = new Nature(habitat);
        
        // Restore flywheel from brain
        await habitat.restore();
        
        // Feed cosmic entropy for this session
        await habitat.feedCosmicEntropy();
        
        // Store globally
        global.__vant_habitat = habitat;
        global.__vant_nature = nature;
        
        // Wire sandbox to RLS (sandbox as carrier)
        const sandbox = require('./sandbox');
        sandbox.initRLS(habitat);
        
        if (debug) console.log('[vant] Habitat initialized:', Object.keys(habitat.workspaces).length, 'workspaces');
    } catch (e) {
        if (debug) console.log('[vant] Habitat init skipped:', e.message);
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
    getMemoize().set('agent:identity', AGENT_STATE, { ttl: 3600000 });
    
    // AI-first: auto-hydrate islands based on agent context
    const islands = getIslands();
    const islandContext = `${AGENT_STATE.name} ${AGENT_STATE.role}`.toLowerCase();
    const triggeredIslands = islands.findTriggers(islandContext);
    if (triggeredIslands.length > 0) {
        islands.autoHydrate(islandContext);
        if (debug) console.log('[vant] Auto-hydrated islands:', triggeredIslands);
    }
    
    // State machine: starting → running
    AGENT_STATE.status = 'running';
    
    // Emit AI-first events
    _emit('agent:initialized', { id: AGENT_STATE.id, name: AGENT_STATE.name, role: AGENT_STATE.role });
    if (debug) console.log('[vant] Emitted agent:initialized');
    
    return AGENT_STATE;
}

/**
 * Generate unique ID
 */
function generateId() {
    const enc = getEncrypt();
    return 'agent_' + Date.now().toString(36) + enc.key(24);
}

// ==================== AUTH ====================

/**
 * Authenticate request - common auth handler for headless
 * Uses config.mcpRequireKey() to gate access
 */
async function authenticate(context = {}) {
    const config = getConfig();
    
    // If no key required, allow
    if (config.mcpRequireKey() !== 'true') {
        return { allowed: true, reason: 'no_key_required' };
    }
    
    const apiKey = context.apiKey || context.secret || context.headers?.['x-api-key'] || context.headers?.['authorization']?.replace('Bearer ', '');
    
    // Lazy-load Auth
    const { Auth } = require('./auth');
    const auth = new Auth();
    const result = auth.validateApiKey(apiKey);
    
    return { 
        allowed: result.valid, 
        reason: result.reason || 'unauthorized',
        layer: 'Auth'
    };
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
    
    // AI-first: emit thinking complete event for reactive agents
    _emit('think:complete', { query, insights: insights.length, memories: brainResult.memories.length });
    
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

// TTL bounds (in ms)
const TTL_MIN = 60000;        // 1 minute minimum
const TTL_MAX = 315360000000; // 100 years maximum

/**
 * Normalize TTL with config defaults and bounds
 */
function _normalizeTTL(ttl, expiresAt, defaultKey) {
    let ms;
    
    if (expiresAt) {
        ms = expiresAt.getTime() - Date.now();
    } else if (ttl) {
        ms = ttl;
    } else {
        // Use config default or hard fallback
        const config = getConfig();
        ms = config?.get(defaultKey) || null;
    }
    
    // Clamp to bounds
    if (ms !== null && ms !== undefined) {
        ms = Math.max(TTL_MIN, Math.min(TTL_MAX, ms));
    } else {
        // Hard fallbacks
        ms = defaultKey === 'memory.ttl' ? 315360000000 : 86400000;
    }
    
    return ms;
}

/**
 * Learn new information
 * @param {string} key - Learning key (category/key format)
 * @param {string} content - Content to learn
 * @param {object} options - Optional: { ttl: number, expiresAt: Date }
 */
async function learn(key, content, options = {}) {
    const brain = getBrain();
    const { ttl, expiresAt } = options;
    
    // Determine TTL with bounds
    const learnTTL = _normalizeTTL(ttl, expiresAt, 'learn.ttl');
    
    // Parse key as category/key
    const parts = key.split('/');
    const category = parts[0] || 'learnings';
    const fileKey = parts.slice(1).join('/') || 'default.md';
    
    // Write to brain
    brain.write(category, fileKey, content);
    
    // Memoize for fast recall
    getMemoize().set('learn:' + key, content, { ttl: learnTTL });
    
    // Log to audit
    getAudit().log({
        type: 'learn',
        key,
        agent: AGENT_STATE.id
    });
    
    // AI-first: emit learning event for reactive updates
    _emit('learn:saved', { key, category, contentLength: content.length });
    
    return { success: true, key, ttl: learnTTL };
}

/**
 * Remember across sessions
 * @param {string} key - Memory key
 * @param {string} content - Content to store (if provided, stores; otherwise recalls)
 * @param {object} options - Optional: { ttl: number, expiresAt: Date }
 */
async function remember(key, content, options = {}) {
    const { ttl, expiresAt } = options;
    
    // Determine TTL with bounds
    const memoryTTL = _normalizeTTL(ttl, expiresAt, 'memory.ttl');
    
    if (content) {
        // Store in cache (fast)
        getMemoize().set('memory:' + key, content, { ttl: memoryTTL });
        
        // Store persistently in brain as a brain file
        try {
            getBrain().write('memory', key + '.md', content);
        } catch (e) {
            // Brain write failed, but cache succeeded
        }
        
        return { success: true, key, content, ttl: memoryTTL };
    } else {
        // Recall - try cache first, then brain as fallback
        const cached = getMemoize().get('memory:' + key);
        if (cached !== undefined) {
            return cached;
        }
        
        // Cache miss - try to load from brain
        try {
            const brain = getBrain();
            if (brain && brain.loadBrain) {
                const result = await brain.loadBrain('memory/' + key);
                if (result && result.content) {
                    // Restore to cache with fresh TTL
                    getMemoize().set('memory:' + key, result.content, { ttl: memoryTTL });
                    return result.content;
                }
            }
        } catch (e) {
            // Brain load failed, return undefined
        }
        
        return undefined;
    }
}

// ==================== ACT ====================

/**
 * Execute operation with AI-first security chain + events
 * Adds: VAF validation + QoS rate limiting + Escrow budget + lock serialization
 * Uses existing module getters from vant.js
 */

let _vaf = null;
function _getVaf() {
    if (!_vaf) try { _vaf = require('./vaf'); } catch (e) {}
    return _vaf;
}
// Uses existing getQoS and getEscrow from vant.js (lines ~138-141, ~??)

async function act(operation, options = {}) {
    const { timeout = 30000, retries = 0, validation = {} } = options;
    
    const startTime = Date.now();
    const opKey = operation?.type || operation?.name || 'default';
    
    // AI-first: emit executing event
    _emit('act:executing', { opKey, operation: typeof operation === 'function' ? operation.name : 'value' });
    
    // VAF: Validate input if schema provided
    const vaf = _getVaf();
    if (validation.schema && vaf?.check) {
        try { vaf.check(operation, validation.schema); } catch (e) {
            _emit('act:blocked', { opKey, reason: 'VAF validation failed', error: e.message });
            return { error: e.message, code: 'VAF_DENIED' };
        }
    }
    
    // QoS: Rate limiting per operation type (reuses existing getQoS)
    const qos = getQoS();
    if (qos?.RateLimiter) {
        const limiter = new qos.RateLimiter({ windowMs: 60000, maxPerMinute: 1000 });
        if (!limiter.check(opKey)) {
            _emit('act:blocked', { opKey, reason: 'Rate limit exceeded' });
            return { error: 'Rate limit exceeded for: ' + opKey, code: 'RATE_LIMIT' };
        }
    }
    
    // Escrow: Budget quota check (needs to be fetched)
    let _escrow = null;
    try { _escrow = require('./escrow'); } catch(e) {}
    if (_escrow?.checkQuota) {
        const quota = _escrow.checkQuota(opKey, 1);
        if (!quota.allowed) {
            _emit('act:blocked', { opKey, reason: 'Escrow quota exceeded' });
            return { error: 'Escrow quota exceeded for: ' + opKey, code: 'ESCROW_LIMIT' };
        }
    }
    
    // Acquire lock for serialization
    const lock = getLock().acquire(AGENT_STATE.id, 10000);
    if (!lock) {
        _emit('act:blocked', { opKey, reason: 'Lock held by another agent' });
        return { error: 'Locked', code: 'LOCKED' };
    }
    
    try {
        // Execute operation
        const result = typeof operation === 'function' 
            ? await operation()
            : operation;
        
        // Audit
        getAudit().log({
            type: 'act',
            operation: opKey,
            duration: Date.now() - startTime,
            agent: AGENT_STATE.id
        });
        
        // AI-first: emit completed event
        _emit('act:completed', { opKey, duration: Date.now() - startTime, success: true });
        
        return { success: true, result, duration: Date.now() - startTime };
        
    } catch (e) {
        _emit('act:failed', { opKey, error: e.message, duration: Date.now() - startTime });
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
 * Start in headless mode - HTTP server without MCP
 * Use when you want Vant as a library with REST API, no MCP
 * 
 * @param {object} options - Configuration
 * @param {number} options.port - HTTP server port (default: 3000)
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Promise<object>} Startup result
 */
async function startHeadless(options = {}) {
    const {
        port = 3000,
        debug = false,
        taskId = null
    } = options;

    if (AGENT_STATE.status === 'running') {
        return { error: 'Already running', status: AGENT_STATE.status };
    }

    if (debug) console.log('[vant] Starting headless...');

    // Step 1: Init agent
    await init({ taskId, debug });

    // Step 2: Start HTTP server (no MCP)
    try {
        if (debug) console.log('[vant] Starting HTTP server on port', port);
        const server = require('./server');
        await server.start({ port, debug });
    } catch (e) {
        if (debug) console.log('[vant] Server start error:', e.message);
    }

    // Step 3: Event system ready
    try {
        const event = require('./event');
        event.getStatus?.();
    } catch (e) {}

    return {
        started: true,
        mode: 'headless',
        status: AGENT_STATE.status,
        id: AGENT_STATE.id,
        session: AGENT_STATE.session,
        endpoints: {
            health: `http://localhost:${port}/health`,
            tools: `http://localhost:${port}/tools`,
            brain: `http://localhost:${port}/brain`
        }
    };
}

/**
 * Check if operation is allowed
 */
function isOperationAllowed(operation) {
    return { allowed: true, layer: 'Vant', operation };
}

// ==================== DISCOVERY REGISTRY ====================
// AI-first module auto-discovery
// Uses existing fs and path from top of file
// Note: Named _discoveryReg to avoid collision with node-registry getter

let _discoveryReg = null;
let _discoveryBuilt = false;

/**
 * Auto-scan lib/ and build module registry with capabilities
 * Returns: { modules: Map<name, { path, capabilities, status }> }
 */
function buildRegistry() {
    if (_discoveryBuilt) return _discoveryReg;
    
    _discoveryReg = {
        version: '0.8.6',
        built: Date.now(),
        modules: new Map(),
        byCapability: new Map()
    };
    
    const libDir = path.join(__dirname);
    if (!fs.existsSync(libDir)) return _discoveryReg;
    
    const files = fs.readdirSync(libDir).filter(f => f.endsWith('.js') && !f.startsWith('.'));
    
    for (const file of files) {
        const name = file.replace('.js', '');
        const filePath = path.join(libDir, file);
        
        // Derive capabilities from filename patterns
        const caps = [];
        if (/brain|storage|islands|memory/.test(name)) caps.push('memory');
        if (/search|query/.test(name)) caps.push('search');
        if (/agent|msg|delegate/.test(name)) caps.push('agency');
        if (/sandbox|vaf|lock|escrow|security/.test(name)) caps.push('security');
        if (/compute|embed/.test(name)) caps.push('compute');
        if (/network|http|fetch/.test(name)) caps.push('network');
        if (/event|pub|sub|queue/.test(name)) caps.push('events');
        if (/cron|schedule|job/.test(name)) caps.push('scheduling');
        if (/metric|audit|health/.test(name)) caps.push('observability');
        if (/config|option/.test(name)) caps.push('config');
        
        _discoveryReg.modules.set(name, { file: name + '.js', path: filePath, capabilities: caps, status: 'discovered' });
        
        // Index by capability
        for (const cap of caps) {
            if (!_discoveryReg.byCapability.has(cap)) {
                _discoveryReg.byCapability.set(cap, []);
            }
            _discoveryReg.byCapability.get(cap).push(name);
        }
    }
    
    _discoveryBuilt = true;
    
    // AI-first: emit discovery complete event
    _emit('module:discovered', { count: _discoveryReg.modules.size, capabilities: _discoveryReg.byCapability.size });
    
    return _discoveryReg;
}

/**
 * Discover available modules - returns list of discovered modules
 */
function discover(filter = {}) {
    const reg = buildRegistry();
    
    if (filter.capability) {
        const byCap = reg.byCapability.get(filter.capability) || [];
        return byCap.map(name => ({ name, ...reg.modules.get(name) }));
    }
    
    if (filter.status) {
        return Array.from(reg.modules.entries())
            .filter(([_, v]) => v.status === filter.status)
            .map(([name, v]) => ({ name, ...v }));
    }
    
    return Array.from(reg.modules.entries())
        .map(([name, v]) => ({ name, ...v }));
}

/**
 * Find module by capability
 */
function findByCapability(cap) {
    const reg = buildRegistry();
    return reg.byCapability.get(cap) || [];
}

/**
 * Get module registry (discovery registry)
 */
function getRegistry() {
    return buildRegistry();
}

// ==================== EXPORTS ====================

module.exports = {
    // Core
    version: '0.8.6',
    init,
    startFull,
    startHeadless,
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
 * Execute tool by name - routes to MCP tools for OS-level function gating
 */
async function executeTool(toolName, args = {}) {
    // Built-in tools (6)
    const tools = {
        think: () => think(args.query, args.opts),
        learn: () => learn(args.key, args.content),
        remember: () => remember(args.key, args.content),
        act: () => act(args.operation, args.opts),
        search: () => getSearch().queryBrain(args.query, args.opts),
        brain: () => getBrain().get(args.key),
    };
    
    // Check built-in first
    if (tools[toolName]) {
        return tools[toolName]();
    }
    
    // Fallback: route to MCP tools (158+ tools)
    try {
        const mcp = require('./mcp');
        if (mcp && mcp.execute) {
            const result = await mcp.execute(toolName, args);
            if (result && !result.error) {
                return result;
            }
        }
    } catch (e) {
        // Fall through to error
    }
    
    return { error: 'Unknown tool: ' + toolName };
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

// NEW: Layer 3 Services (embed + compute)
module.exports.embed = getEmbed;
module.exports.compute = getCompute;

// NEW: Habitat + Nature (environment + spark)
module.exports.habitat = getHabitat;
module.exports.nature = getNature;

// NEW: System status dashboard
let _system;
const getSystem = () => {
    if (!_system) _system = require('./system');
    return _system;
};
module.exports.system = getSystem;

// NEW: Metrics
let _metrics;
const getMetrics = () => {
    if (!_metrics) _metrics = require('./metrics');
    return _metrics;
};
module.exports.metrics = getMetrics;

// MCP (tools)
let _mcp;
const getMcp = () => {
    if (!_mcp) try { _mcp = require('./mcp'); } catch(e) {}
    return _mcp;
};
module.exports.mcp = getMcp;

// NODE REGISTRY (distributed peer discovery) 
let _nodeRegistry;
const getNodeRegistry = () => {
    if (!_nodeRegistry) _nodeRegistry = require('./node-registry');
    return _nodeRegistry;
};
module.exports.nodeRegistry = getNodeRegistry;
module.exports.registry = getNodeRegistry; // also exposed as 'registry'

// Core OS services - add if missing
let _sync, _remote, _lineage, _schema, _rules;
try {
    const _s = require('./sync');
    if (_s) { _sync = () => _s; module.exports.sync = () => _s; }
} catch(e) {}
try {
    const _r = require('./remote');
    if (_r) { _remote = () => _r; module.exports.remote = () => _r; }
} catch(e) {}
try {
    const _l = require('./lineage');
    if (_l) { _lineage = () => _l; module.exports.lineage = () => _l; }
} catch(e) {}
try {
    const _sc = require('./schema');
    if (_sc) { _schema = () => _sc; module.exports.schema = () => _sc; }
} catch(e) {}
try {
    const _ru = require('./rules');
    if (_ru) { _rules = () => _ru; module.exports.rules = () => _ru; }
} catch(e) {}

// CONSENSUS (51% voting)
try {
    const _c = require('./consensus');
    if (_c) { _consensus = () => _c; module.exports.consensus = () => _c; }
} catch(e) {}

// Core functions
module.exports.init = init;
module.exports.think = think;
module.exports.learn = learn;
module.exports.remember = remember;
module.exports.act = act;
module.exports.shutdown = shutdown;
module.exports.getState = getState;
module.exports.getStatus = getStatus;
module.exports.authenticate = authenticate;

// NEW: AI-first Discovery Registry
module.exports.discover = discover;
module.exports.findByCapability = findByCapability;
module.exports.buildRegistry = buildRegistry;
module.exports.getRegistry = getRegistry;
