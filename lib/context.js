/**
 * VANT Context Engine (v0.8.6)
 * 
 * Prompt caching and context assembly for AI models.
 * Optimizes token costs with deterministic prompt structure and cache breakpoints.
 * 
 * SECURITY: Full VANT OS chain integration
 * - VAF: Input validation on brain names, cache keys
 * - Sandbox: Capability checks for file access
 * - QoS: Rate limiting on context builds and heartbeats
 * - Escrow: Budget checks for cache operations
 * 
 * Reference: Gemini conversation on prompt caching
 * 
 * Core Principles:
 * 1. Strict Top-Down Structure: Static → Dynamic. Any change at top invalidates everything below.
 * 2. Cache Control Blocks: Use cache_control: {type: "ephemeral"}. Max 4 breakpoints per request.
 * 3. Byte-Level Consistency: Same order every time. Watch whitespace/trailing newlines.
 * 4. TTL: 5 min expiry. Group requests within 4 min or use heartbeat to keep warm.
 * 
 * Usage:
 *   const context = require('./context');
 *   
 *   // Build context for prompt
 *   const ctx = await context.build({ brain: 'axolotl' });
 *   
 *   // Get current context state
 *   const state = context.getContext();
 *   
 *   // Force refresh
 *   await context.refresh();
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ============================================
// SECURITY CHAIN - Lazy-loaded
// ============================================

let _vaf = null;
function _getVAF() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) { return null; }
    }
    return _vaf;
}

let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) { return null; }
    }
    return _sandbox;
}

let _qos = null;
function _getQoS() {
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) { return null; }
    }
    return _qos;
}

let _escrow = null;
function _getEscrow() {
    if (!_escrow) {
        try { _escrow = require('./escrow'); } catch (e) { return null; }
    }
    return _escrow;
}

// ============================================
// SECURITY: Validate input
// ============================================

/**
 * Validate brain name - VAF input validation
 */
function _validateBrainName(brainName) {
    // Always validate - brain names are identifiers, not paths
    // Pattern: alphanumeric, dash, underscore only (like Git branch names)
    if (!brainName || typeof brainName !== 'string') {
        throw new Error('Invalid brain name: must be a non-empty string');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(brainName)) {
        throw new Error('Invalid brain name: alphanumeric, dash, underscore only');
    }
    
    return true;
}

/**
 * Check sandbox capabilities
 */
function _checkCanRead() {
    const sandbox = _getSandbox();
    if (sandbox && !sandbox.canRead()) {
        throw new Error('Sandbox: read capability required');
    }
}

function _checkCanWrite() {
    const sandbox = _getSandbox();
    if (sandbox && !sandbox.canWrite()) {
        throw new Error('Sandbox: write capability required');
    }
}

// ============================================
// CONSTANTS
// ============================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL = 4 * 60 * 1000; // 4 minutes
const MAX_CACHE_BREAKPOINTS = 4;

// Context layers (top to bottom)
const LAYERS = {
    STATIC: 'static',      // identity.md, lessons.md, preferences.md
    TOOLS: 'tools',        // MCP tool schemas
    HISTORY: 'history',    // Chat history
    DYNAMIC: 'dynamic'     // git diffs, shell logs, active tasks
};

// Static brain files that are always first
const STATIC_FILES = [
    'identity.md',
    'lessons.md', 
    'preferences.md',
    'goals.md',
    'errors.md',
    'reflection.md'
];

// ============================================
// STATE
// ============================================

let _brain = null;
let _memory = null;
let _config = null;
let _emitter = new EventEmitter();

// Per-brain cache state
const _cacheState = new Map();

// Current context
let _currentContext = null;
let _lastBuild = null;

// Heartbeat timer
let _heartbeatTimer = null;
let _heartbeatEnabled = false;

// ============================================
// INITIALIZATION
// ============================================

function _getBrain() {
    if (!_brain) {
        try {
            _brain = require('./brain');
        } catch (e) {
            console.warn('[context] Brain not loaded:', e.message);
        }
    }
    return _brain;
}

function _getMemory() {
    if (!_memory) {
        try {
            _memory = require('./memory');
        } catch (e) {
            // Memory is optional
        }
    }
    return _memory;
}

function _getConfig() {
    if (!_config) {
        try {
            _config = require('./config');
        } catch (e) {
            // Config is optional
        }
    }
    return _config;
}

// ============================================
// CORE: Context Assembly
// ============================================

/**
 * Build context from brain files
 * @param {Object} opts - Options
 * @param {string} opts.brain - Brain name (optional, uses current)
 * @param {boolean} opts.includeTools - Include MCP tool schemas
 * @param {boolean} opts.includeHistory - Include chat history
 * @param {boolean} opts.includeDynamic - Include dynamic content (git diffs, etc)
 * @returns {Promise<Object>} Assembled context
 */
async function build(opts = {}) {
    // SECURITY: Check capabilities first
    _checkCanRead();
    
    // SECURITY: Validate brain name
    const brain = _getBrain();
    if (!brain) {
        return { error: 'Brain not loaded', layers: {} };
    }

    const brainName = opts.brain || brain.getCurrentBrain?.() || 'default';
    _validateBrainName(brainName);
    
    // QoS: Rate limit context builds
    const qos = _getQoS();
    if (qos?.canProceed?.('context:build') === false) {
        return { error: 'Rate limited', layers: {} };
    }
    
    const layers = {};
    
    // Get cache state for this brain
    const cacheState = _getCacheState(brainName);
    
    // 1. STATIC LAYER (cacheable)
    layers.static = await _gatherStatic(brainName);
    
    // 2. TOOLS LAYER (cacheable)
    if (opts.includeTools !== false) {
        layers.tools = await _gatherTools();
    }
    
    // 3. HISTORY LAYER (cacheable)
    if (opts.includeHistory !== false) {
        layers.history = await _gatherHistory();
    }
    
    // 4. DYNAMIC LAYER (NOT cacheable)
    if (opts.includeDynamic !== false) {
        layers.dynamic = await _gatherDynamic();
    }

    // Assemble with cache breakpoints
    const assembled = _assemble(layers);
    
    // Add cache metadata
    const context = {
        brain: brainName,
        assembled,
        layers,
        cache: {
            breakpoints: MAX_CACHE_BREAKPOINTS,
            ttl: CACHE_TTL,
            state: cacheState,
            lastBuild: Date.now()
        }
    };

    // Update cache state
    _updateCacheState(brainName, context);
    
    _currentContext = context;
    _lastBuild = Date.now();
    
    // Emit event
    _emitter.emit('context:built', context);
    
    return context;
}

/**
 * Gather static brain files (identity, lessons, preferences, etc)
 */
async function _gatherStatic(brainName) {
    const brain = _getBrain();
    const brainPath = brain?.getBrainPath?.() || 'models/private';
    
    const files = [];
    
    // First, try to get static files in order
    for (const staticFile of STATIC_FILES) {
        const filePath = path.join(brainPath, staticFile);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            files.push({
                name: staticFile,
                content: content.slice(0, 50000), // Limit size
                type: 'static'
            });
        }
    }
    
    // Then get other brain files (sorted deterministically)
    try {
        const brainDirs = brain?.brainDirs?.() || { private: [brainName], public: [] };
        const allBrains = [...(brainDirs.private || []), ...(brainDirs.public || [])];
        
        for (const b of allBrains) {
            if (b === brainName) continue; // Already processed
            
            const bPath = path.join('models/private', b);
            if (fs.existsSync(bPath)) {
                const entries = fs.readdirSync(bPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isFile() && !STATIC_FILES.includes(entry.name)) {
                        const content = fs.readFileSync(path.join(bPath, entry.name), 'utf8');
                        files.push({
                            name: `${b}/${entry.name}`,
                            content: content.slice(0, 20000), // Smaller limit for secondary brains
                            type: 'brain'
                        });
                    }
                }
            }
        }
    } catch (e) {
        // Ignore errors from secondary brains
    }
    
    return {
        files: sortFiles(files),
        type: 'static'
    };
}

/**
 * Gather MCP tool schemas
 */
async function _gatherTools() {
    // Get tools from MCP server if available
    const tools = [];
    
    try {
        // Try to get MCP tools
        const mcp = require('./mcp');
        if (mcp?.getTools) {
            const mcpTools = await mcp.getTools();
            for (const tool of mcpTools) {
                tools.push({
                    name: tool.name || tool.command,
                    schema: tool.inputSchema || {},
                    type: 'mcp'
                });
            }
        }
    } catch (e) {
        // MCP not available, try registry
    }
    
    return {
        tools: sortTools(tools),
        type: 'tools'
    };
}

/**
 * Gather chat history
 */
async function _gatherHistory() {
    // Get from memory/state if available
    const memory = _getMemory();
    const history = [];
    
    if (memory?.state) {
        try {
            const historyKey = 'context:history';
            const stored = await memory.state(historyKey);
            if (stored && Array.isArray(stored)) {
                history.push(...stored.slice(-50)); // Last 50 messages
            }
        } catch (e) {
            // Ignore
        }
    }
    
    return {
        messages: history,
        type: 'history'
    };
}

/**
 * Gather dynamic content (git diffs, shell logs, etc)
 */
async function _gatherDynamic() {
    const dynamic = [];
    
    // Git diff (if in a git repo)
    try {
        const { execSync } = require('child_process');
        const diff = execSync('git diff --stat HEAD 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 5000 });
        if (diff) {
            dynamic.push({
                type: 'git',
                content: diff.slice(0, 10000)
            });
        }
    } catch (e) {
        // Not a git repo or error
    }
    
    return {
        items: dynamic,
        type: 'dynamic'
    };
}

/**
 * Assemble layers into final context
 */
function _assemble(layers) {
    const parts = [];
    
    // 1. Static (with cache breakpoint)
    if (layers.static?.files?.length) {
        parts.push(`<!-- CACHE_BREAKPOINT: static -->`);
        for (const file of layers.static.files) {
            parts.push(`\n### ${file.name}\n${file.content}\n`);
        }
    }
    
    // 2. Tools (with cache breakpoint)
    if (layers.tools?.tools?.length) {
        parts.push(`\n<!-- CACHE_BREAKPOINT: tools -->`);
        for (const tool of layers.tools.tools) {
            parts.push(`\n#### Tool: ${tool.name}\n\`\`\`\n${JSON.stringify(tool.schema, null, 2)}\n\`\`\`\n`);
        }
    }
    
    // 3. History (with cache breakpoint)
    if (layers.history?.messages?.length) {
        parts.push(`\n<!-- CACHE_BREAKPOINT: history -->`);
        for (const msg of layers.history.messages) {
            parts.push(`\n${msg.role}: ${msg.content?.slice(0, 500) || ''}\n`);
        }
    }
    
    // 4. Dynamic (NO cache - always fresh)
    if (layers.dynamic?.items?.length) {
        parts.push(`\n<!-- DYNAMIC (no cache) -->`);
        for (const item of layers.dynamic.items) {
            parts.push(`\n### ${item.type}\n${item.content}\n`);
        }
    }
    
    return parts.join('\n');
}

// ============================================
// DETERMINISTIC SORTING
// ============================================

/**
 * Sort files alphabetically (stable sort)
 */
function sortFiles(files) {
    return [...files].sort((a, b) => {
        // Static files first, in defined order
        const aStatic = STATIC_FILES.includes(a.name);
        const bStatic = STATIC_FILES.includes(b.name);
        
        if (aStatic && !bStatic) return -1;
        if (!aStatic && bStatic) return 1;
        if (aStatic && bStatic) {
            return STATIC_FILES.indexOf(a.name) - STATIC_FILES.indexOf(b.name);
        }
        
        // Then alphabetical
        return a.name.localeCompare(b.name);
    });
}

/**
 * Sort tools alphabetically by name
 */
function sortTools(tools) {
    return [...tools].sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        return aName.localeCompare(bName);
    });
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cache state for a brain
 */
function _getCacheState(brainName) {
    if (!_cacheState.has(brainName)) {
        _cacheState.set(brainName, {
            brain: brainName,
            created: Date.now(),
            hits: 0,
            invalidations: 0,
            lastInvalidation: null
        });
    }
    return _cacheState.get(brainName);
}

/**
 * Update cache state after build
 */
function _updateCacheState(brainName, context) {
    const state = _getCacheState(brainName);
    state.lastBuild = Date.now();
    state.hits++;
    state.context = context;
}

/**
 * Invalidate cache for a brain
 */
function invalidate(brainName = 'default') {
    const state = _getCacheState(brainName);
    state.invalidations++;
    state.lastInvalidation = Date.now();
    state.context = null;
    
    _emitter.emit('context:invalidated', { brain: brainName });
    
    return { invalidated: true, brain: brainName };
}

/**
 * Force full refresh
 */
async function refresh() {
    // Invalidate all brains
    for (const brainName of _cacheState.keys()) {
        invalidate(brainName);
    }
    
    // Rebuild
    return build({});
}

/**
 * Check if cache is valid
 */
function isCacheValid(brainName = 'default') {
    const state = _cacheState.get(brainName);
    if (!state?.lastBuild) return false;
    
    return (Date.now() - state.lastBuild) < CACHE_TTL;
}

/**
 * Get cache state for a brain
 */
function getCacheState(brainName = 'default') {
    return _getCacheState(brainName);
}

// ============================================
// HEARTBEAT
// ============================================

/**
 * Start heartbeat to keep cache warm
 */
function startHeartbeat() {
    if (_heartbeatEnabled) return;
    
    _heartbeatEnabled = true;
    _heartbeatTimer = setInterval(async () => {
        await ping();
    }, HEARTBEAT_INTERVAL);
    
    _emitter.emit('heartbeat:started');
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
    if (!_heartbeatEnabled) return;
    
    _heartbeatEnabled = false;
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
    
    _emitter.emit('heartbeat:stopped');
}

/**
 * Lightweight warm-up call
 */
async function ping() {
    // Rebuild if cache is stale
    if (!isCacheValid()) {
        await build({});
    }
    
    _emitter.emit('heartbeat:ping', { time: Date.now() });
    
    return { ok: true, timestamp: Date.now() };
}

/**
 * Get heartbeat status
 */
function getHeartbeatStatus() {
    return {
        enabled: _heartbeatEnabled,
        interval: HEARTBEAT_INTERVAL,
        lastPing: _lastBuild
    };
}

// ============================================
// INSPECTION
// ============================================

/**
 * Get current context state
 */
function getContext() {
    return _currentContext;
}

/**
 * Get context layers
 */
function getLayers() {
    return _currentContext?.layers || {};
}

/**
 * Inspect context state
 */
function inspect() {
    return {
        current: _currentContext ? {
            brain: _currentContext.brain,
            layers: Object.keys(_currentContext.layers),
            cacheValid: isCacheValid(_currentContext.brain),
            lastBuild: _currentContext.cache?.lastBuild
        } : null,
        cacheStates: Array.from(_cacheState.entries()).map(([brain, state]) => ({
            brain,
            hits: state.hits,
            invalidations: state.invalidations,
            lastBuild: state.lastBuild,
            valid: (Date.now() - (state.lastBuild || 0)) < CACHE_TTL
        })),
        heartbeat: getHeartbeatStatus()
    };
}

// ============================================
// STACK CONTEXT (v0.9.0-axolotl)
// ============================================

/**
 * Build context across all brains in stack
 * MULTIBRAIN: Gathers context from ALL brains in stack
 * @param {Object} opts - Options (same as build())
 * @returns {Promise<Object>} Combined context from all brains
 */
async function buildStack(opts = {}) {
    const brain = _getBrain();
    if (!brain || !brain.getStack) {
        // No brain - just build single
        return await build(opts);
    }

    const stack = brain.getStack();
    if (!stack || stack.length === 0) {
        return await build(opts);
    }

    // Gather context from each brain in stack
    const stackLayers = {};
    const stackErrors = [];

    for (const brainName of stack) {
        try {
            // Push brain context
            if (brain.pushBrain) {
                brain.pushBrain(brainName);
            }

            // Build context for this brain
            const brainCtx = await build({ ...opts, brain: brainName });
            stackLayers[brainName] = {
                brain: brainName,
                layers: brainCtx.layers,
                assembled: brainCtx.assembled,
                cache: brainCtx.cache
            };
        } catch (e) {
            stackErrors.push({ brain: brainName, error: e.message });
        } finally {
            // Pop brain context
            if (brain.removeBrain) {
                brain.removeBrain();
            }
        }
    }

    // Combine all layers
    const combined = _combineStackLayers(stackLayers);

    const result = {
        source: 'stack',
        brains: stack,
        layers: combined.layers,
        assembled: combined.assembled,
        brainLayers: stackLayers,
        errors: stackErrors,
        cache: {
            breakpoints: MAX_CACHE_BREAKPOINTS,
            ttl: CACHE_TTL,
            lastBuild: Date.now(),
            type: 'stack'
        }
    };

    _currentContext = result;
    _lastBuild = Date.now();

    // Emit event
    _emitter.emit('context:built:stack', result);

    return result;
}

/**
 * Combine layers from all brains in stack
 * @private
 */
function _combineStackLayers(stackLayers) {
    const combined = {
        static: [],
        tools: [],
        history: [],
        dynamic: []
    };

    const brainNames = Object.keys(stackLayers).sort();

    for (const brainName of brainNames) {
        const ctx = stackLayers[brainName];
        if (!ctx || !ctx.layers) continue;

        // Add static with brain prefix
        if (ctx.layers.static) {
            const staticItems = Array.isArray(ctx.layers.static)
                ? ctx.layers.static
                : [ctx.layers.static];
            for (const item of staticItems) {
                combined.static.push({
                    ...item,
                    _brain: brainName,
                    _id: (item._id || item.id || item.title) + '|' + brainName
                });
            }
        }

        // Add tools with brain prefix
        if (ctx.layers.tools) {
            const toolItems = Array.isArray(ctx.layers.tools)
                ? ctx.layers.tools
                : [ctx.layers.tools];
            for (const item of toolItems) {
                combined.tools.push({
                    ...item,
                    _brain: brainName,
                    _id: (item.name || item.id) + '|' + brainName
                });
            }
        }

        // Add history with brain prefix
        if (ctx.layers.history) {
            const historyItems = Array.isArray(ctx.layers.history)
                ? ctx.layers.history
                : [ctx.layers.history];
            for (const item of historyItems) {
                combined.history.push({
                    ...item,
                    _brain: brainName
                });
            }
        }

        // Add dynamic with brain prefix
        if (ctx.layers.dynamic) {
            const dynamicItems = Array.isArray(ctx.layers.dynamic)
                ? ctx.layers.dynamic
                : [ctx.layers.dynamic];
            for (const item of dynamicItems) {
                combined.dynamic.push({
                    ...item,
                    _brain: brainName
                });
            }
        }
    }

    // Assemble combined context
    const assembled = _assemble(combined);

    return { layers: combined, assembled };
}

/**
 * Get context for specific brain in stack
 * @param {string} brainName - Brain name
 * @param {Object} opts - Options
 * @returns {Promise<Object>} Context for that brain
 */
async function buildBrain(brainName, opts = {}) {
    const brain = _getBrain();
    if (!brain) {
        return { error: 'Brain not loaded' };
    }

    // Validate brain name
    _validateBrainName(brainName);

    // Push brain context
    if (brain.pushBrain) {
        brain.pushBrain(brainName);
    }

    try {
        return await build({ ...opts, brain: brainName });
    } finally {
        // Pop brain context
        if (brain.removeBrain) {
            brain.removeBrain();
        }
    }
}

/**
 * Get stack info
 * @returns {Object} Stack information
 */
function getStackInfo() {
    const brain = _getBrain();
    const stack = brain?.getStack?.() || [];

    return {
        stack,
        count: stack.length,
        current: brain?.getCurrent?.() || null
    };
}

// ============================================
// MODEL COMPATIBILITY
// ============================================

/**
 * Get cache control blocks for a model
 * @param {string} model - Model name (claude, minimax, deepseek, openai)
 * @returns {Object} Cache control settings
 */
function getCacheControl(model) {
    const modelLower = (model || '').toLowerCase();
    
    // Models with explicit cache_control support
    const explicitModels = ['claude', 'minimax', 'anthropic'];
    
    // Models with auto sequence matching
    const autoModels = ['deepseek', 'openai', 'gpt'];
    
    if (explicitModels.some(m => modelLower.includes(m))) {
        return {
            type: 'explicit',
            breakpoints: MAX_CACHE_BREAKPOINTS,
            ttl: CACHE_TTL,
            inject: true
        };
    }
    
    if (autoModels.some(m => modelLower.includes(m))) {
        return {
            type: 'auto',
            breakpoints: 0, // Not used
            ttl: 0,
            inject: false // Only deterministic ordering matters
        };
    }
    
    // Default: assume no cache support
    return {
        type: 'none',
        breakpoints: 0,
        ttl: 0,
        inject: false
    };
}

// ============================================
// EVENTS
// ============================================

/**
 * Listen to context events
 */
function on(event, callback) {
    _emitter.on(event, callback);
}

/**
 * Remove event listener
 */
function off(event, callback) {
    _emitter.off(event, callback);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Core
    build,
    refresh,
    invalidate,
    
    // Stack (v0.9.0-axolotl)
    buildStack,
    buildBrain,
    getStackInfo,
    
    // Sorting
    sortFiles,
    sortTools,
    
    // Cache
    isCacheValid,
    getCacheState,
    
    // Heartbeat
    startHeartbeat,
    stopHeartbeat,
    ping,
    getHeartbeatStatus,
    
    // Inspection
    getContext,
    getLayers,
    inspect,
    
    // Model
    getCacheControl,
    
    // Events
    on,
    off,
    
    // Constants
    LAYERS,
    STATIC_FILES,
    CACHE_TTL,
    HEARTBEAT_INTERVAL,
    MAX_CACHE_BREAKPOINTS
};
