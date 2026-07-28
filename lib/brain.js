/**
 * Brain Router v2 (v0.8.6)
 * WITH EVENT EMISSIONS - brain loading/saving emits globally
 *
 * Single source of truth for brain loading with:
 * - Registry: register handlers dynamically
 * - Pipeline: composable chains per brain type
 * - Hooks: beforeLoad, afterLoad, onMiss handlers
 * - Aliases: brain name mappings
 * - Transformers: content transformations on load/save
 * - Lazy middleware: dynamically add to chain
 *
 * All modules should require this, not manage paths themselves.
 * 
 * SECURITY: Recursion guard to prevent brain load loops
 */

// ==================== EVENT SYSTEM ====================
// Re-use lazy-loaded _event from brain.js internal state

const fs = require('fs');
const sudo = require('./sudo');
const errors = require('./error');
const path = require('path');
const guard = require('./recursion');  // Unified recursion guard

// Format handler for multi-format brain files
let _format = null;
function _getFormat() {
    if (!_format) {
        try { _format = require('./format'); } catch (e) {}
    }
    return _format;
}

const _statePath = path.join(__dirname, '..', 'models', 'state.json');

// Write lock to prevent concurrent writes

// VAF for security validation
let _vaf = null;
function _getVaf() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) {}
    }
    return _vaf;
}
let _saveStatePromise = null;

// ==================== STATE PERSISTENCE (ASYNC ONLY) ====================
async function _loadState() {
    try {
        const content = await fs.promises.readFile(_statePath, 'utf8');
        const state = JSON.parse(content);
        // Load stack from state if present
        if (state.stack && Array.isArray(state.stack)) {
            _brainStack = state.stack;
            // MULTIBRAIN: Restore currentBrain from stack[0]
            if (state.stack.length > 0) {
                _currentBrain = state.stack[0];
            }
        }
        return state;
    } catch (e) {
        return { neurons: {}, stack: [] };
    }
}

async function _saveState(state) {
    // If a save is already in progress, wait for it to complete first
    if (_saveStatePromise) {
        await _saveStatePromise;
    }
    
    // Create the save promise and store it
    const doSave = async () => {
        // Save stack because _loadState resets _brainStack from file!
        const stackToSave = [..._brainStack];
        // Also preserve current mode (from _mode variable)
        const modeToSave = _mode;
        
        // FIX: Read file directly without using _loadState (which resets _brainStack!)
        let current;
        try {
            const content = await fs.promises.readFile(_statePath, 'utf8');
            current = JSON.parse(content);
        } catch (e) {
            current = { neurons: {}, stack: [] };
        }
        
        // SECURITY: Prevent prototype pollution - filter dangerous keys
        const safeState = {};
        for (const [key, value] of Object.entries(state || {})) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            safeState[key] = value;
        }
        current.neurons = { ...current.neurons, ...safeState };
        // Use saved stack instead of current _brainStack
        current.stack = stackToSave;
        // Preserve mode - either from state param or from _mode variable
        if (state?.mode) {
            current.mode = state.mode;
        } else if (modeToSave) {
            current.mode = modeToSave;
        }
        // FIX: Also preserve currentBrain in state
        if (state?.currentBrain) {
            current.currentBrain = state.currentBrain;
        } else if (_currentBrain) {
            current.currentBrain = _currentBrain;
        }
        current.updated = new Date().toISOString();
        await fs.promises.writeFile(_statePath, JSON.stringify(current, null, 2));
    };
    
    _saveStatePromise = doSave();
    try {
        await _saveStatePromise;
    } finally {
        _saveStatePromise = null;
    }
}

function getNeuronState() {
    return _loadState().then(s => s.neurons || {});
}

function saveNeuronState(state) {
    return _saveState({ neurons: state });
}

// FIX: Add missing restoreNeuronState function
async function restoreNeuronState(state) {
    if (!state || typeof state !== 'object') {
        throw new errors.VantError('Invalid neuron state', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }
    
    // Get current state
    const current = await _loadState();
    
    // Merge with provided state
    current.neurons = { ...current.neurons, ...state };
    current.updated = new Date().toISOString();
    
    // Save directly without going through _saveState (which would read file first)
    await fs.promises.writeFile(_statePath, JSON.stringify(current, null, 2));
    
    // Note: We just saved the state to disk. The synapses and attention
    // will be reloaded from disk when getNeuronState() is called.
    
    return current.neurons;
}

// ==================== EXISTING MODULE INTEGRATIONS ====================
// All existing app modules - brain wires to these
let _storage = null;
let _search = null;
let _islands = null;
let _config = null;
let _cache = null;
let _lock = null;
let _audit = null;
let _vectorStore = null;
let _cron = null;
let _msg = null;
let _agents = null;
let _encrypt = null;
let _stego = null;
let _qos = null;
let _network = null;
let _sandbox = null;
let _event = null;
let _storageModule = null;
let _corpusCache = null;
let _corpusCacheMode = null;

const getStorage = () => { if (!_storage) try { _storage = require('./storage'); } catch (e) {} return _storage; };
const getSearch = () => { if (!_search) try { _search = require('./search'); } catch (e) {} return _search; };
const getIslands = () => { if (!_islands) try { _islands = require('./islands'); } catch (e) {} return _islands; };
const getConfig = () => { if (!_config) try { _config = require('./config'); } catch (e) {} return _config; };
const getCache = () => { if (!_cache) try { _cache = require('./cache'); } catch (e) {} return _cache; };
const getLock = () => { if (!_lock) try { _lock = require('./lock'); } catch (e) {} return _lock; };
const getAudit = () => { if (!_audit) try { _audit = require('./audit'); } catch (e) {} return _audit; };
const getVectorStore = () => { if (!_vectorStore) try { _vectorStore = require('./storage').get?.('vector'); } catch (e) {} return _vectorStore; };
const getCron = () => { if (!_cron) try { _cron = require('./cron'); } catch (e) {} return _cron; };
const getMsg = () => { if (!_msg) try { _msg = require('./msg'); } catch (e) {} return _msg; };
const getAgents = () => { if (!_agents) try { _agents = require('./agents'); } catch (e) {} return _agents; };
const getEncrypt = () => { if (!_encrypt) try { _encrypt = require('./encrypt'); } catch (e) {} return _encrypt; };
const getStego = () => { if (!_stego) try { _stego = require('./stego'); } catch (e) {} return _stego; };
const getQoS = () => { if (!_qos) try { _qos = require('./qos'); } catch (e) {} return _qos; };
const getNetwork = () => { if (!_network) try { _network = require('./network'); } catch (e) {} return _network; };
const getSandbox = () => { if (!_sandbox) try { _sandbox = require('./sandbox'); } catch (e) {} return _sandbox; };

// Auto-chain through sandbox for capability + RLS
function _checkRead(userCtx, resource) {
    const sandbox = getSandbox();
    if (!sandbox) return;
    
    // Capability check
    if (sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('Capability denied', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    
    // Auto-chain to RLS for per-record
    if (userCtx && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}

function _checkWrite(userCtx, resource) {
    const sandbox = getSandbox();
    if (!sandbox) return;
    
    // Capability check
    if (sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('Capability denied', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    
    // Auto-chain to RLS for per-record
    if (userCtx && sandbox._rls) {
        sandbox._rls.checkWrite(userCtx, resource, 'write');
    }
}

// ==================== SECURITY CHAIN ====================

/**
 * Run security chain for brain operations
 * VAF → QoS → Escrow
 */
async function _runBrainSecurityChain(operation, options = {}) {
    const { type = 'read', category = '', key = '', content = '' } = options;
    const isWrite = type === 'write' || operation === 'write' || operation === 'save';
    
    // 1. VAF: Input validation
    try {
        const vaf = require('./vaf');
        if (vaf && vaf.check) {
            const input = JSON.stringify({ category, key, content: content?.slice(0, 500) });
            const vafResult = vaf.check(input, { mode: isWrite ? 'strict' : 'read' });
            if (vafResult && vafResult.blocked) {
                _emit('brain:vaf:blocked', { operation, category, key, timestamp: Date.now() });
                throw new errors.VantError('Input validation failed', { code: errors.CODES.INPUT_VALIDATION_FAILED });
            }
        }
    } catch (e) {
        if (e.message.includes('validation failed') || e.message.includes('blocked')) throw e;
    }
    
    // 2. QoS: Rate limiting
    let qosCleanup = null;
    try {
        const qos = require('./qos');
        if (qos && qos.canProceed) {
            if (!qos.canProceed()) {
                _emit('brain:qos:throttled', { operation, timestamp: Date.now() });
                throw new errors.VantError('Circuit breaker open', { code: errors.CODES.CIRCUIT_BREAKER_OPEN });
            }
            if (isWrite && content) {
                const sizeCheck = qos.checkInputSize(JSON.stringify({ category, key, content }));
                if (!sizeCheck.valid) {
                    throw new errors.VantError('Input too large', { code: errors.CODES.VAF_TOO_LONG });
                }
            }
            qos.incrementActive();
            qosCleanup = () => qos.decrementActive();
        }
    } catch (e) {
        if (e.message.includes('Rate limit') || e.message.includes('too large')) throw e;
    }
    
    // 3. Escrow: RLS for writes
    if (isWrite) {
        try {
            const escrow = require('./escrow');
            if (escrow && escrow.create) {
                const escrowInstance = escrow.create({ habitat: options.habitat || 'default' });
                if (escrowInstance && escrowInstance.canWrite) {
                    const canWrite = await escrowInstance.canWrite(options.userCtx || {}, { category, key });
                    if (!canWrite) {
                        if (qosCleanup) qosCleanup();
                        _emit('brain:escrow:denied', { operation, category, key, timestamp: Date.now() });
                        throw new errors.VantError('Write not permitted', { code: errors.CODES.ESCROW_DENIED });
                    }
                }
            }
        } catch (e) {
            if (qosCleanup) qosCleanup();
            if (e.message.includes('not permitted')) throw e;
        }
    }
    
    return qosCleanup;
}

const getEvent = () => { if (!_event) try { _event = require('./event'); } catch (e) {} return _event; };

// Event emit helper - uses brain's _event
function _emit(event, data) {
    const ev = getEvent();
    if (ev?.emit) {
        ev.emit(event, data);
    }
}

// Export aggregated module access
function getModule(name) {
    const modules = {
        storage: getStorage, search: getSearch, islands: getIslands, config: getConfig,
        cache: getCache, lock: getLock, audit: getAudit, vectorStore: getVectorStore,
        cron: getCron, msg: getMsg, agents: getAgents, encrypt: getEncrypt,
        stego: getStego, qos: getQoS, network: getNetwork, sandbox: getSandbox, event: getEvent
    };
    return modules[name]?.() || null;
}

// ==================== SANDBOX BRAIN HANDLERS ====================
// Wire brain file ops through sandbox for gating/control
function _wireBrainToSandbox() {
    const sb = getSandbox();
    if (!sb || !sb.registerBrainHandler) return;
    
    // Register brain handlers with sandbox
    sb.registerBrainHandler('read', (filePath) => {
        if (!sb || !sb.can || !sb.can('canRead')) return null;
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    });
    
    sb.registerBrainHandler('exists', (filePath) => {
        if (!sb || !sb.can || !sb.can('canRead')) return false;
        return fs.existsSync(filePath);
    });
    
    sb.registerBrainHandler('list', (dirPath, pattern) => {
        if (!sb || !sb.can || !sb.can('canRead')) return [];
        if (!fs.existsSync(dirPath)) return [];
        return fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    });
}

// ==================== REGISTRY ====================
// Register handlers for sandbox, vaf, qos, escrow, etc.
const _registry = new Map();
// Default handlers (lazy-loaded)
const _defaults = {
    sandbox: () => { try { return require('./sandbox'); } catch (e) { return null; } },
    vaf: () => { try { return require('./vaf'); } catch (e) { return null; } },
    qos: () => { try { return require('./qos'); } catch (e) { return null; } },
    escrow: () => { try { return require('./escrow'); } catch (e) { return null; } }
};
const _handlers = new Map();

/**
 * Register a handler for a middleware type
 * @param {string} name - Handler name (sandbox, vaf, qos, escrow, custom...)
 * @param {function|object} handler - Handler function or object
 */
function register(name, handler) {
    // Block prototype pollution
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
        throw new errors.Error('Invalid handler name: ' + name, { code: errors.CODES.BRAIN_HANDLER_INVALID, retryable: false });
    }
    _handlers.set(name, handler);
    _registry.set(name, { handler, registered: new Date().toISOString() });
}

/**
 * Get a registered handler
 * @param {string} name - Handler name
 * @returns {object|null} Handler
 */
function getHandler(name) {
    // For escrow, always check global first (boot sets it after init)
    // This must be checked BEFORE cache lookup to ensure boot's escrow is used
    if (name === 'escrow') {
        if (global._escrow) return global._escrow;
        // Also try defaults which checks global
        if (_defaults[name]) return _defaults[name]();
        return null;
    }
    // Check registered first
    if (_handlers.has(name)) {
        return _handlers.get(name);
    }
    // Fall back to defaults
    if (_defaults[name]) {
        return _defaults[name]();
    }
    return null;
}

/**
 * List all registered handlers
 * @returns {Array} Handler names
 */
function listHandlers() {
    return Array.from(new Set([..._registry.keys(), ...Object.keys(_defaults)])).sort();
}

// ==================== PIPELINE ====================
// Composable chains per brain type
// CRITICAL handlers: MUST succeed - hard fail if they error
const _criticalHandlers = new Set(['sandbox', 'vaf', 'qos', 'escrow']);
// Pipeline state for debugging
const _pipelineState = {
    lastError: null,
    lastFailedHandler: null,
    degraded: false,
    lastRun: null
};

const _pipelines = {
    dual: [],
    public: [],
    private: [],
    remote: []
};
// Default pipeline for each mode
const _defaultPipeline = ['sandbox', 'vaf', 'qos', 'escrow'];

/**
 * Get pipeline for mode
 * @param {string} mode - Brain mode
 * @returns {Array} Pipeline chain
 */
function getPipeline(mode) {
    return _pipelines[mode]?.length ? _pipelines[mode] : _defaultPipeline;
}

/**
 * Set pipeline for mode
 * @param {string} mode - Brain mode
 * @param {Array} chain - Handler names
 */
function setPipeline(mode, chain) {
    if (_pipelines[mode] !== undefined) {
        _pipelines[mode] = chain;
    }
}

/**
 * Add middleware to pipeline
 * @param {string} mode - Brain mode
 * @param {string} name - Handler name
 * @param {number} [pos] - Position (default: end)
 */
function addMiddleware(mode, name, pos) {
    if (!_pipelines[mode]) _pipelines[mode] = [];
    if (pos !== undefined) {
        _pipelines[mode].splice(pos, 0, name);
    } else {
        _pipelines[mode].push(name);
    }
}

/**
 * Remove middleware from pipeline
 * @param {string} mode - Brain mode
 * @param {string} name - Handler name
 */
function removeMiddleware(mode, name) {
    if (_pipelines[mode]) {
        _pipelines[mode] = _pipelines[mode].filter(h => h !== name);
    }
}

/**
 * Get pipeline state for debugging
 * @returns {Object} Pipeline diagnostic state
 */
function getPipelineState() {
    return {
        ..._pipelineState,
        chain: getPipeline('dual'),
        lastError: _pipelineState.lastError?.message || null,
        lastErrorStack: _pipelineState.lastError?.stack || null
    };
}

/**
 * Execute pipeline with proper error handling
 * @param {string} mode - Brain mode
 * @param {object} ctx - Context object
 * @param {function} final - Final handler
 */
async function executePipeline(mode, ctx, final) {
    const chain = getPipeline(mode);
    const errors = [];
    
    // Reset pipeline state
    _pipelineState.lastError = null;
    _pipelineState.lastFailedHandler = null;
    _pipelineState.degraded = false;
    _pipelineState.lastRun = new Date().toISOString();
    
    for (const name of chain) {
        const handler = getHandler(name);
        const isCritical = _criticalHandlers.has(name);
        
        if (!handler) {
            if (isCritical) {
                const err = new Error(`Critical handler not found: ${name}`);
                errors.push({ handler: name, error: err, critical: true });
                _pipelineState.lastError = err;
                _pipelineState.lastFailedHandler = name;
                _pipelineState.degraded = true;
                getAudit()?.error(`[BRAIN PIPELINE] FATAL: ${name} not available - cannot proceed`);
                throw err;
            }
            getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} not available - skipping (optional)`);
            continue;
        }
        
        try {
            let result;
            
            // Execute handler based on its type
            if (typeof handler === 'function') {
                result = await handler(ctx);
            } else if (typeof handler?.run === 'function') {
                result = await handler.run(ctx);
            } else if (typeof handler?.can === 'function') {
                // Sandbox has can() for capability checks - use BEFORE execute
                // Sandbox can() checks capabilities (canRead, canWrite, etc) - NOT brain names
                // For loadBrain, we're doing 'read' operation
                try {
                    const capability = 'canRead';  // Load = read operation
                    result = handler.can(capability);
                    if (!result) {
                        throw new errors.Error('Pipeline blocked: ' + name + ' denied ' + capability + ' for ' + ctx.name, { code: errors.CODES.BRAIN_PIPELINE_BLOCKED, retryable: false });
                    }
                } catch (e) {
                    if (isCritical) throw e;
                    getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name}.can() failed - ${e.message}`);
                    continue;
                }
            } else if (typeof handler?.execute === 'function') {
                // QoS, Escrow use execute() method
                result = await handler.execute(ctx);
            } else if (typeof handler?.check === 'function') {
                result = await handler.check(ctx.name);
            } else {
                // Unknown handler type - warn but continue
                getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} has no valid execute method - skipping`);
                continue;
            }
            
            getAudit()?.info(`[BRAIN PIPELINE] OK: ${name}`);
            
        } catch (e) {
            errors.push({ handler: name, error: e, critical: isCritical });
            
            if (isCritical) {
                // CRITICAL failure - STOP the chain
                _pipelineState.lastError = e;
                _pipelineState.lastFailedHandler = name;
                _pipelineState.degraded = true;
                
                getAudit()?.error(`[BRAIN PIPELINE] FATAL: ${name} threw error: ${e.message}`);
                getAudit()?.error(`[BRAIN PIPELINE] Stack: ${e.stack}`);
                
                // Emit error event for monitoring
                if (_getPubSub()) {
                    _getPubSub().publish('brain:pipeline:error', {
                        handler: name,
                        error: e.message,
                        critical: true,
                        timestamp: Date.now()
                    });
                }
                
                throw e;
            }
            
            // OPTIONAL handler failure - log and continue
            getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} error - ${e.message} (optional - continuing)`);
        }
    }
    
    // If we get here with non-critical errors, log them but continue
    if (errors.length > 0) {
        _pipelineState.degraded = true;
        getAudit()?.warn(`[BRAIN PIPELINE] WARN: Pipeline finished with ${errors.length} error(s):`, 
            errors.map(e => `${e.handler}: ${e.error.message}`).join(', '));
    }
    
    if (final) {
        return await final(ctx);
    }
}

// ==================== HOOKS ====================
// Lifecycle handlers
const _hooks = {
    beforeLoad: [],
    afterLoad: [],
    onMiss: [],
    beforeSave: [],
    afterSave: []
};

let _pubsub = null;

/**
 * Get event.js PubSub for brain events
 */
function _getPubSub() {
    if (!_pubsub) {
        const event = getEvent();
        if (event?.PubSub) {
            _pubsub = new event.PubSub();
        }
    }
    return _pubsub;
}

/**
 * Register a hook
 * @param {string} event - Hook event
 * @param {function} fn - Handler function
 */
function on(event, fn) {
    if (_hooks[event]) {
        _hooks[event].push(fn);
    }
    // Also register with event.js PubSub
    const ps = _getPubSub();
    if (ps?.subscribe) {
        ps.subscribe('brain:' + event, fn);
    }
}

/**
 * Remove a hook
 * @param {string} event - Hook event
 * @param {function} fn - Handler function
 */
function off(event, fn) {
    if (_hooks[event]) {
        _hooks[event] = _hooks[event].filter(h => h !== fn);
    }
    const ps = _getPubSub();
    if (ps?.unsubscribe) {
        ps.unsubscribe('brain:' + event, fn);
    }
}

/**
 * Emit a hook
 * @param {string} event - Hook event
 * @param {object} ctx - Context
 */
async function emit(event, ctx) {
    if (!_hooks[event]) return;
    for (const fn of _hooks[event]) {
        await fn(ctx);
    }
    // Also emit to event.js PubSub
    const ps = _getPubSub();
    if (ps?.publish) {
        ps.publish('brain:' + event, ctx);
    }
}

// ==================== ALIASES ====================
// Name mappings
const _aliases = {};

/**
 * Add alias for brain name
 * @param {string} alias - Alias
 * @param {string} name - Actual brain name
 */
function alias(alias, name) {
    _aliases[alias] = name;
}

/**
 * Resolve brain name from alias
 * @param {string} name - Brain name
 * @returns {string} Resolved name
 */
function resolve(name) {
    return _aliases[name] || name;
}

/**
 * Get all aliases
 * @returns {object} Alias map
 */
function listAliases() {
    return { ..._aliases };
}

// ==================== TRANSFORMERS ====================
// Content transformations
const _transformers = {
    load: [],
    save: []
};

/**
 * Add transformer
 * @param {string} type - 'load' or 'save'
 * @param {function} fn - Transformer function
 */
function transform(type, fn) {
    if (_transformers[type]) {
        _transformers[type].push(fn);
    }
}

/**
 * Apply transformers
 * @param {string} type - 'load' or 'save'
 * @param {object} brain - Brain object
 * @returns {object} Transformed brain
 */
async function applyTransforms(type, brain) {
    if (!_transformers[type]?.length) return brain;
    let result = { ...brain };
    for (const fn of _transformers[type]) {
        result = await fn(result) || result;
    }
    return result;
}

// ==================== FORMAT TRANSFORMER (v0.8.6) ====================
// Auto-detect and parse yaml, json, md, txt using format.js
try {
    const format = require('./format');
    
    transform('load', async (brain) => {
        if (!brain.content) return brain;
        
        const { name, content } = brain;
        if (!content) return brain;
        
        try {
            // Auto-detect format from name extension
            const detected = format.detectFromPath(name);
            const formatResult = format.parse(content, {
                format: detected.format,
                schema: 'workflow',  // Try workflow schema validation
                validate: false   // Don't fail on missing fields
            });
            
            if (formatResult.data && !formatResult.error) {
                // Return normalized data instead of raw content
                return {
                    ...brain,
                    content: formatResult.format === 'json' 
                        ? JSON.stringify(formatResult.data)
                        : (formatResult.data.body || formatResult.data.intent || JSON.stringify(formatResult.data))
                };
            }
        } catch (e) {
            // Fall through - return original brain
        }
        return brain;
    });
    
} catch (e) {
    // format.js not available, skip transformer
}

// ==================== MODE SWITCH ====================
let _mode = 'dual';
let _remoteURL = null;

function getMode() { return _mode; }
function setMode(mode) {
    if (['dual', 'public', 'private', 'remote'].includes(mode)) {
        _mode = mode;
        // FIX: Persist mode to state.json
        _saveState({ mode: _mode }).catch(e => console.warn('[brain] Failed to save mode:', e.message));
    }
}
function getRemoteURL() { return _remoteURL; }
function setRemoteURL(url) { _remoteURL = url; }

// ==================== CACHE ====================
// In-memory brain cache (using existing cache.js)
const _brainCache = new Map();
let _cacheEnabled = true;
let _cacheTTL = 60000; // 1 minute default

/**
 * Enable/disable cache
 */
function setCache(enabled, ttl) {
    _cacheEnabled = enabled !== false;
    if (ttl) _cacheTTL = ttl;
    // Also configure real cache module
    const cache = getCache();
    if (cache?.configure) {
        cache.configure({ ttl: _cacheTTL });
    }
}

/**
 * Get cached brain
 * @param {string} name - Brain name
 * @returns {object|null} Cached brain or null
 */
function _getCached(name) {
    if (!_cacheEnabled) return null;
    const entry = _brainCache.get(name);
    if (!entry) {
        // Try real cache module
        const cache = getCache();
        if (cache?.get) {
            const data = cache.get('brain:' + name);
            if (data) return data;
        }
        return null;
    }
    // Check TTL
    if (Date.now() - entry.ts > _cacheTTL) {
        _brainCache.delete(name);
        return null;
    }
    return entry.data;
}

/**
 * Cache brain
 * @param {string} name - Brain name
 * @param {object} data - Brain data
 */
function _setCached(name, data) {
    if (!_cacheEnabled || !data) return;
    _brainCache.set(name, { data, ts: Date.now() });
    // Also store in real cache
    const cache = getCache();
    if (cache?.set) {
        cache.set('brain:' + name, data, { ttl: _cacheTTL });
    }
}

/**
 * Invalidate cache
 * @param {string} [name] - Specific brain or all
 */
function invalidateCache(name) {
    if (name) {
        _brainCache.delete(name);
        const cache = getCache();
        if (cache?.remove) cache.remove('brain:' + name);
    } else {
        _brainCache.clear();
        const cache = getCache();
        if (cache?.clear) cache.clear();
    }
}

/**
 * Get cache stats
 */
function getCacheStats() {
    const entries = [];
    for (const [name, { ts }] of _brainCache) {
        entries.push({ name, age: Date.now() - ts });
    }
    return {
        size: _brainCache.size,
        enabled: _cacheEnabled,
        ttl: _cacheTTL,
        entries
    };
}

// ==================== WATCHER ====================
// File system watcher for brain changes
let _watcher = null;
let _watchEnabled = false;

function _setupWatcher() {
    if (_watcher) return;
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    try {
        _watcher = fs.watch(brainPath, { recursive: true }, (event, filename) => {
            if (filename?.endsWith('.md')) {
                invalidateCache(filename.replace('.md', ''));
                emit('brainChanged', { name: filename.replace('.md', ''), event });
            }
        });
    } catch (e) { console.warn("[brain] Watch error:", e.message); }
}

/**
 * Start/stop watching brain files
 */
function setWatch(enabled) {
    _watchEnabled = enabled;
    if (enabled && !_watcher) {
        _setupWatcher();
    }
}

/**
 * Check if watching
 */
function isWatching() {
    return _watchEnabled;
}

// ==================== HEALTH & METRICS ====================
const _metrics = {
    loads: 0,
    cacheHits: 0,
    errors: 0,
    loadTime: 0
};

/**
 * Get metrics
 */
function getMetrics() {
    return {
        ..._metrics,
        cacheHitRate: _metrics.loads > 0 ? _metrics.cacheHits / _metrics.loads : 0
    };
}

/**
 * Reset metrics
 */
function resetMetrics() {
    _metrics.loads = 0;
    _metrics.cacheHits = 0;
    _metrics.errors = 0;
    _metrics.loadTime = 0;
}

// ==================== NEURAL PATHWAYS ====================
// Synaptic weights: track brain access patterns for AI prediction
const _synapses = new Map(); // brainA -> { brainB: weight }
const _spikes = []; // unusual access events

/**
 * Fire synapse - track brain A → brain B access
 */
function fireSynapse(fromBrain, toBrain) {
    if (!_synapses.has(fromBrain)) _synapses.set(fromBrain, new Map());
    const weights = _synapses.get(fromBrain);
    weights.set(toBrain, (weights.get(toBrain) || 0) + 1);
}

/**
 * Predict next brain - get weighted path prediction
 */
function predictNext(currentBrain) {
    const weights = _synapses.get(currentBrain);
    if (!weights) return null;
    let max = 0, prediction = null;
    for (const [brain, w] of weights) {
        if (w > max) { max = w; prediction = brain; }
    }
    return prediction;
}

/**
 * Get all synaptic pathways
 */
function getSynapses() {
    const result = {};
    for (const [from, weights] of _synapses) {
        result[from] = Object.fromEntries(weights);
    }
    return result;
}

// ==================== METABOLISM ====================
// Resource management: auto-gc, attention decay
const _metabolism = { gcThreshold: 100, attentionDecay: 0.95 };
let _attention = new Map(); // brain -> attention score
let _lastLoaded = null; // track last loaded brain for synapse chaining

/**
 * Update attention score (0-1)
 */
function attend(brain, score) {
    _attention.set(brain, score);
}

/**
 * Get attention score
 */
function getAttention(brain) {
    return _attention.get(brain) || 0;
}

/**
 * NEW: Attend to brain by semantic similarity (auto-compute attention)
 * Uses embed to score how relevant brain is to query
 * Higher similarity = higher attention = prioritized in search
 */
async function attendBySemantic(query, brainNames = [], boost = 0.1) {
    const embed = require('./embed');

// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('./encrypt'); } catch (e) {}
    }
    return _Encrypt;
}
    const queryVec = await embed.embed(query);
    
    for (const name of brainNames) {
        // Get brain content
        const b = await load(name);
        const content = b?.content || b?.title || '';
        
        if (content) {
            const docVec = await embed.embed(content);
            const score = embed.cosineSimilarity(queryVec, docVec);
            
            // Boost existing attention by semantic score
            const current = getAttention(name);
            const newScore = Math.min(1, current + (score * boost));
            attend(name, newScore);
        }
    }
    
    return { boosted: brainNames.length };
}

/**
 * Metabolize - decay attention, gc stale cache
 */
function metabolize() {
    // Decay attention
    for (const [brain, score] of _attention) {
        const decayed = (score || 0) * _metabolism.attentionDecay;
        if (decayed < 0.01) _attention.delete(brain);
        else _attention.set(brain, decayed);
    }
    // GC brain cache if over threshold
    if (_brainCache.size > _metabolism.gcThreshold) {
        for (const [name, { ts }] of _brainCache) {
            if (Date.now() - ts > _cacheTTL) {
                _brainCache.delete(name);
            }
        }
    }
}

// ==================== DREAMING ====================
// Background consolidation using cron.JobWorker
let _dreamState = null;
let _dreamEnabled = false;
let _dreamHour = 3;
let _dreamWorker = null;

/**
 * Enable dreaming - schedule via cron.JobWorker
 * Consolidation: merge learnings, extract insights, update brain
 */
function dream(enabled, hour = 3) {
    _dreamEnabled = enabled;
    _dreamHour = hour;
    if (enabled) {
        const cron = getCron();
        if (cron?.JobWorker) {
            _dreamWorker = new cron.JobWorker({ concurrency: 1 });
            _dreamWorker.add('dream', _processDream, { hour });
        }
    }
    return { enabled, hour };
}

/**
 * Process dream job - consolidate corpus learnings
 */
async function _processDream(payload) {
    const corpus = await loadCorpus();
    const learnings = corpus.find(c => c.id === 'learnings');
    const lessons = corpus.find(c => c.id === 'lessons');
    
    if (!learnings || !lessons) return { consolidated: 0 };
    
    // Extract insights from lessons into learnings
    const lessonsContent = lessons.content || '';
    const insights = [];
    
    // Parse === INSIGHT === markers
    const insightRegex = /=== ([A-Z]+) ===\s*([\s\S]*?)(?===|$)/g;
    let match;
    while ((match = insightRegex.exec(lessonsContent)) !== null) {
        insights.push({ type: match[1], content: match[2].trim() });
    }
    
    // Update learnings with new insight
    if (insights.length > 0) {
        const newInsights = insights.map(i => `- ${i.type}: ${i.content.slice(0, 100)}`).join('\n');
        const updated = `${learnings.content}\n\n## Nightly Consolidation\n${newInsights}\n`;
        await write('learnings', 'consolidated', updated);
    }
    
    // NEW: Also consolidate evolution insights from recent sessions
    const evolutionHistory = await getEvolutionHistory();
    if (evolutionHistory.recentInsights && evolutionHistory.recentInsights.length > 0) {
        const insightsText = evolutionHistory.recentInsights
            .map(i => `- Session insight: ${i.insight.slice(0, 100)}`)
            .join('\n');
        
        // Append evolution insights to learnings
        const existing = learnings.content || '';
        const updated = `${existing}\n\n## Evolution Insights\n${insightsText}\n`;
        await write('learnings', 'consolidated', updated);
    }

    return { consolidated: insights.length + (evolutionHistory.recentInsights?.length || 0) };
}

// ==================== SELF-HEALING ====================
// Auto-retry with fallback on failure
const _fallbacks = new Map(); // brain -> fallback brain

/**
 * Register fallback brain for failed loads
 * Usage: brain.onFail('missing', 'identity') // fallback to identity if missing not found
 */
function onFail(brain, fallback) {
    _fallbacks.set(brain, fallback);
    return { brain, fallback };
}

/**
 * Get fallback brain
 */
function getFallback(brain) {
    return _fallbacks.get(brain);
}

/**
 * Auto-heal - retry with fallback
 */
async function _heal(brain) {
    const fallback = _fallbacks.get(brain);
    if (fallback) {
        getAudit()?.info(`[brain] ${brain} missing, falling back to ${fallback}`);
        return load(fallback);
    }
    return null;
}

// ==================== PRELOAD ====================
// Speculative loading of related brains
const _preloadQueue = [];

/**
 * Preload related brains
 */
async function preload(brain) {
    const prediction = predictNext(brain);
    if (prediction) {
        _preloadQueue.push(prediction);
        return load(prediction).then(loaded => loaded || { id: prediction, name: prediction });
    }
    return null;
}

/**
 * Process preload queue
 */
async function _processPreload() {
    while (_preloadQueue.length > 0) {
        const brain = _preloadQueue.shift();
        const cached = _getCached(brain);
        if (!cached) load(brain).catch(() => {});
    }
}

// ==================== FORGETTING ====================
// Synaptic pruning
const _forgetThreshold = 1000; // forget if weight below threshold

/**
 * Prune synapses
 */
function forget(brain) {
    _attention.delete(brain);
    _brainCache.delete(brain);
    // Prune incoming synapses
    for (const [from, weights] of _synapses) {
        weights.delete(brain);
    }
    // Delete brain's outgoing synapses
    _synapses.delete(brain);
}

// ==================== LIFECYCLE ====================
// Bootstrap and shutdown
const _lifecycle = {
    bootstrap: [],
    shutdown: []
};

/**
 * Register bootstrap hook
 */
function onBootstrap(fn) {
    _lifecycle.bootstrap.push(fn);
}

/**
 * Run bootstrap
 */
async function bootstrap() {
    // Restore neuron state from disk
    const saved = getNeuronState();
    if (saved.synapses) {
        for (const [from, weights] of Object.entries(saved.synapses)) {
            for (const [to, weight] of Object.entries(weights)) {
                _synapses.set(from, new Map([[to, weight]]));
            }
        }
    }
    if (saved.attention) {
        for (const [brain, score] of Object.entries(saved.attention)) {
            _attention.set(brain, score);
        }
    }
    
    for (const fn of _lifecycle.bootstrap) {
        await fn();
    }
    // Start metabolism tick every minute (saves state)
    setInterval(() => {
        metabolize();
        _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                  attention: Object.fromEntries(_attention) });
    }, 60000);
}

/**
 * Register shutdown hook
 */
function onShutdown(fn) {
    _lifecycle.shutdown.push(fn);
}

/**
 * Run shutdown
 */
async function shutdown() {
    // Save neuron state
    _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                attention: Object.fromEntries(_attention) });
    
    // Stop watcher
    if (_watcher) {
        _watcher.close();
        _watcher = null;
    }
    // Clear cache
    _cache.clear();
    // Run shutdown hooks
    for (const fn of _lifecycle.shutdown) {
        await fn();
    }
}

// ==================== REMOTE TUNNEL ====================
async function _fetchRemote(name) {
    if (!_remoteURL) return null;
    const url = _remoteURL.replace(/\/$/, '') + '/brain/' + name + '.json';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// ==================== MULTI-BRAIN REGISTRY ====================
// Lazy-load brain registry for multi-brain support
let _brainRegistry = null;
// ==================== MULTI-BRAIN STATE ====================
// Multi-brain support: stack-based loading of multiple brains
let _currentBrain = 'vant';  // Current active brain name
let _currentBrainType = 'public';  // 'private' or 'public'
let _brainMode = 'shared';    // Default isolation mode: silo|shared|governance
let _brainRoots = {
    private: 'models/private',
    public: 'models/public'
};
// Initialize stack from state file synchronously on module load
let _brainStack = (function() {
    try {
        const fs = require('fs');
        const path = require('path');
        const statePath = path.join(__dirname, '..', 'models', 'state.json');
        const content = fs.readFileSync(statePath, 'utf8');
        const state = JSON.parse(content);
        if (state.stack && Array.isArray(state.stack)) {
            // MULTIBRAIN: Restore currentBrain from stack[0]
            if (state.stack.length > 0) {
                _currentBrain = state.stack[0];
                
                // FIX: Detect brain type based on where brain directory exists
                const privatePath = path.join(__dirname, '..', 'models', 'private', _currentBrain);
                const publicPath = path.join(__dirname, '..', 'models', 'public', _currentBrain);
                
                if (fs.existsSync(privatePath)) {
                    _currentBrainType = 'private';
                } else if (fs.existsSync(publicPath)) {
                    _currentBrainType = 'public';
                }
                // Otherwise keeps default 'public'
            }
            return state.stack;
        }
    } catch (e) {}
    return ['vant'];
})();

// Load a stack of brains (e.g., ['vant', 'my-research'])
// Private brains are checked first, then public
// Load brain(s) - supports single or multiple
// If array, loads all; if string, loads single
async function load(brains, options = {}) {
    // Handle both single brain (string) and multiple brains (array)
    if (typeof brains === 'string') {
        brains = [brains];
    }
    
    if (!Array.isArray(brains)) {
        throw new errors.VantError('Invalid brain load type', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }
    
    const loaded = [];
    const errors = [];
    
    for (const name of brains) {
        try {
            // Validate brain exists first
            const type = options.type || 'private';
            const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
            const path = root + '/' + name;
            const fs = require('fs');
            
            if (!fs.existsSync(path)) {
                errors.push({ brain: name, error: 'not found' });
                continue;
            }
            
            // Load the brain (call original load function)
            await _loadBrain(name, options);
            loaded.push(name);
            
            // Auto-track brain loads in evolution session
            recordChange('load', { name, source: type });
        } catch (e) {
            errors.push({ brain: name, error: e.message });
        }
    }
    
    return { loaded, errors, stack: getStack() };
}

/**
 * NEW (v0.8.6): Unified brain read - reads any brain file by name
 * Supports all extensions via format.js
 * @param {string} name - Brain name (without extension)
 * @param {object} opts - { type: 'private'|'public', format: true }
 * @returns {object} { data, content, format, source }
 */
async function read(name, opts = {}) {
    const type = opts.type || 'private';
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];
    
    // Get brain path
    const root = type === 'private' ? getBrainPath() : getPublicPath();
    
    // Try each extension
    for (const ext of extensions) {
        const filePath = path.join(root, name + ext);
        if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const formatName = ext === '.md' ? 'md' : 
                             ext === '.json' ? 'json' : 
                             ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';
            
            // Parse content based on format
            let data = content;
            if (format?.parse && formatName !== 'txt') {
                const parsed = format.parse(content, { format: formatName });
                data = parsed.data || content;
            }
            
            return { 
                data, 
                content, 
                format: formatName, 
                source: type,
                path: filePath
            };
        }
    }
    
    return null;  // Not found
}

/**
 * Load a file using format.js
 * @param {string} filePath - Path to file
 * @param {object} opts - format options
 * @returns {object} { data, content, format, error }
 */
async function loadFile(filePath, opts = {}) {
    const format = _getFormat();
    if (!format?.loadFile) {
        return { error: 'format.js not available' };
    }
    return format.loadFile(filePath, opts);
}

/**
 * Save a file using format.js
 * @param {string} filePath - Path to file
 * @param {object} data - Data to save
 * @param {object} opts - format options
 * @returns {object} { success, error }
 */
async function saveFile(filePath, data, opts = {}) {
    const format = _getFormat();
    if (!format?.saveFile) {
        return { error: 'format.js not available' };
    }
    return format.saveFile(filePath, data, opts);
}

// Merge content across brains in layer stack
// Returns merged view of keys across all brains in stack
async function merge(keys, options = {}) {
    const stack = getStack();
    const results = {};
    const errors = [];
    
    // Save current brain state
    const originalBrain = currentBrain();
    const originalType = _currentBrainType;
    
    try {
        for (const key of (Array.isArray(keys) ? keys : [keys])) {
            const values = [];
            
            // Check each brain in stack order (top to bottom)
            for (const brainName of stack) {
                try {
                    // Switch to this brain temporarily
                    switchBrain(brainName, 'private');
                    
                    // Load the key from this brain
                    const result = await load(key, options);
                    if (result && !result.error) {
                        values.push({ brain: brainName, content: result.content || result.data });
                    }
                } catch (e) {
                    // Skip errors, continue to next brain
                }
            }
            
            if (values.length > 0) {
                results[key] = values;
            } else if (options.requireAll) {
                errors.push({ key, error: 'not found in any brain' });
            }
        }
    } finally {
        // Restore original brain
        switchBrain(originalBrain, originalType);
    }
    
    return { results, errors, stack };
}

// Write to specific brain in stack
async function writeTo(brain, key, data, options = {}) {
    const root = brain.type === 'private' ? _brainRoots.private : _brainRoots.public;
    const path = root + '/' + brain.name;
    
    // Use storage directly
    const storage = _getStorageRef().get('brain');
    return storage.set(key, data, { ...options, path });
}

// ==================== BRAIN WRITER ======================
// Helper to write directly to specific brain path
function _writeToBrain(brainName, brainType, category, key, content) {
    const path = require('path');
    const fs = require('fs');
    const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
    const brainPath = root + '/' + brainName;
    
    const dir = path.join(brainPath, category);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, key + '.md');
    fs.writeFileSync(filePath, content, 'utf8');
    
    return { success: true, path: filePath };
}

// ==================== BRAIN READER ======================
// Helper to read directly from specific brain path
function _readFromBrain(brainName, brainType, category, key) {
    const path = require('path');
    const fs = require('fs');
    const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
    const brainPath = root + '/' + brainName;
    
    // Handle category/key format (e.g., 'test/learn' -> category='test', key='learn')
    const filePath = path.join(brainPath, category, key + '.md');
    if (!fs.existsSync(filePath)) {
        // Try without .md extension in key
        const altPath = path.join(brainPath, category, key);
        if (fs.existsSync(altPath)) {
            return fs.readFileSync(altPath, 'utf8');
        }
        return null;
    }
    
    return fs.readFileSync(filePath, 'utf8');
}

// ==================== GEOMETRY BRAIN ====================
// Per-brain geometric addressing using quasicrystal coordinates
// Each brain has its own NSC9 address space

// Get geometry path for a brain (per-brain geometry storage)
function _getGeometryPath(brainName, type = 'private') {
    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
    return process.env.VANT_GEOMETRY_PATH || `${root}/${brainName}/geometry`;
}

// Load from geometry brain (by barcode)
async function geoLoad(barcode, options = {}) {
    const geometry = require('./geometry');
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = _getGeometryPath(brain, type);
    
    try {
        const data = await geometry.retrieve(barcode, basePath);
        return { barcode, data, source: 'geometry', brain };
    } catch (e) {
        return { error: e.message, barcode, brain };
    }
}

// Store in geometry brain (generates barcode)
// Uses NSC9 address space for collision-free private storage
async function geoStore(key, data, options = {}) {
    const geometry = require('./geometry');
    const memory = require('./memory');
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = _getGeometryPath(brain, type);
    
    // Generate NSC9 barcode - brain-specific facility code
    // NSC9 = New private Space per brain
    // Each brain gets unique facility based on brain name hash
    const brainHash = brain.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const facility = String(Math.abs(brainHash) % 99999).padStart(5, '0');

    // Generate sequence from key hash (deterministic)
    const keyHash = key.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const sequence = String(Math.abs(keyHash) % 99999).padStart(5, '0');
    const checksum = Math.abs(keyHash) % 10;
    const barcode = `9-${facility}-${sequence}-${checksum}`;  // 9 = NSC9 prefix
    
    try {
        await geometry.store(barcode, data, basePath);
        return { barcode, key, stored: true, brain };
    } catch (e) {
        return { error: e.message, brain };
    }
}

// List geometry brain contents
function geoList(options = {}) {
    const fs = require('fs');
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = _getGeometryPath(brain, type);
    
    if (!fs.existsSync(basePath)) {
        return [];
    }
    
    const dirs = fs.readdirSync(basePath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    
    return dirs;
}

// List all brains with geometry storage
function geoBrains() {
    const fs = require('fs');
    const privateRoot = _brainRoots.private;
    const brains = [];
    
    if (!fs.existsSync(privateRoot)) {
        return brains;
    }
    
    const entries = fs.readdirSync(privateRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const geoPath = `${privateRoot}/${entry.name}/geometry`;
            if (fs.existsSync(geoPath)) {
                brains.push({ name: entry.name, type: 'private', geometry: true });
            }
        }
    }
    
    return brains;
}

function loadStack(brains) {
    if (!Array.isArray(brains)) {
        brains = [brains];
    }
    _brainStack = brains;
    _emit('brain:stack', { stack: _brainStack });
    
    // Persist stack to state.json (skip if in bulk restore mode)
    if (!_skipSave) {
        _saveState({}).catch(e => console.warn('[brain] Failed to save stack:', e.message));
    }
    
    return _brainStack;
}

// Flag to track if state has been loaded
let _stateLoaded = false;
let _stateLoadPromise = null;

// FIX: Flag to skip saving during bulk operations (like restore)
let _skipSave = false;
function _setSkipSave(val) {
    _skipSave = val;
}

// Get current brain stack
// Note: Does NOT reload from state - use loadStack() to persist changes
function getStack() {
    // Return current stack without reloading
    // State is only loaded once at module init
    return [..._brainStack];
}


// Get stack (async - waits for state load)
async function getStackAsync() {
    // Ensure state is loaded
    if (!_stateLoaded && !_stateLoadPromise) {
        _stateLoadPromise = _loadState().then(() => {
            _stateLoaded = true;
            _stateLoadPromise = null;
        }).catch(() => {
            _stateLoadPromise = null;
        });
    }
    // Wait for load if pending
    if (_stateLoadPromise) {
        await _stateLoadPromise;
    }
    return [..._brainStack];
}
// Add brain to top of stack
function pushBrain(name, type = 'private') {
    // Validate brain exists
    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
    const path = root + '/' + name;
    const fs = require('fs');
    if (!fs.existsSync(path)) {
        throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_NOT_FOUND });
    }
    if (!_brainStack.includes(name)) {
        _brainStack.unshift(name);  // Add to top (checked first)
        _emit('brain:pushed', { brain: name, stack: _brainStack });
    }
    return _brainStack;
}

// Remove brain from stack
function removeBrain(name) {
    const idx = _brainStack.indexOf(name);
    if (idx > -1) {
        _brainStack.splice(idx, 1);
        _emit('brain:popped', { brain: name, stack: _brainStack });
    }
    return _brainStack;
}

// Resolve a brain name to its full path (checking both private and public)
function resolveBrainPath(name) {
    const fs = require('fs');
    // Check private first
    let path = _brainRoots.private + '/' + name;
    if (fs.existsSync(path)) {
        return { path, type: 'private' };
    }
    // Then public
    path = _brainRoots.public + '/' + name;
    if (fs.existsSync(path)) {
        return { path, type: 'public' };
    }
    return null;
}

// ==================== EVOLUTION CONTEXT ====================
// Session tracking for evolution (vertical learning across sessions)
// Stack is vertical (layered), Chain is horizontal (sequential)

let _evolutionSession = null;
let _evolutionChanges = [];
let _evolutionInsights = [];

function startEvolutionSession(sessionId = null) {
    const id = sessionId || 'session-' + Date.now();
    _evolutionSession = {
        id,
        startTime: Date.now(),
        brains: [..._brainStack],
        changes: [],
        insights: []
    };
    _evolutionChanges = [];
    _evolutionInsights = [];
    _emit('evolution:session:start', { sessionId: id, stack: _brainStack });
    return _evolutionSession;
}

function recordChange(type, data) {
    if (!_evolutionSession) {
        startEvolutionSession();
    }
    const change = { type, data, timestamp: Date.now() };
    _evolutionChanges.push(change);
    _evolutionSession.changes.push(change);
    _emit('evolution:change', change);
}

function recordInsight(insight, metadata = {}) {
    if (!_evolutionSession) {
        startEvolutionSession();
    }
    const rec = { insight, metadata, timestamp: Date.now() };
    _evolutionInsights.push(rec);
    _evolutionSession.insights.push(rec);
    _emit('evolution:insight', rec);
}

function getEvolutionSession() {
    return _evolutionSession;
}

function getEvolutionChanges() {
    return [..._evolutionChanges];
}

function getEvolutionInsights() {
    return [..._evolutionInsights];
}

async function endEvolutionSession() {
    if (!_evolutionSession) {
        return null;
    }
    _evolutionSession.endTime = Date.now();
    _evolutionSession.duration = _evolutionSession.endTime - _evolutionSession.startTime;
    
    // Save evolution data at top level (not in neurons)
    const state = await _loadState();
    state.lastSession = _evolutionSession;
    state.recentInsights = _evolutionInsights.slice(-10);
    state.updated = new Date().toISOString();
    await fs.promises.writeFile(_statePath, JSON.stringify(state, null, 2));
    
    // NEW: Also persist to memory for semantic search
    try {
        const memory = _getMemory();
        if (memory?.learn) {
            const sessionKey = 'evolution/session-' + _evolutionSession.id;
            await memory.learn(sessionKey, JSON.stringify(_evolutionSession), { ttl: 86400 * 30 }); // 30 days
        }
    } catch (e) {
        console.warn('[brain] Memory integration failed:', e.message);
    }
    
    const summary = { ..._evolutionSession };
    _emit('evolution:session:end', summary);
    _evolutionSession = null;
    _evolutionChanges = [];
    _evolutionInsights = [];
    return summary;
}

async function getEvolutionHistory() {
    const state = await _loadState();
    return {
        lastSession: state.lastSession || null,
        recentInsights: state.recentInsights || []
    };
}

// Get/set current brain name
function currentBrain(name) {
    if (name) {
        _currentBrain = name;
        _emit('brain:switched', { brain: name, type: _currentBrainType, mode: _brainMode });
    }
    return _currentBrain;
}

// Get/set brain isolation mode
function brainMode(mode) {
    if (mode) {
        if (!['silo', 'shared', 'governance'].includes(mode)) {
            throw new errors.VantError('Invalid brain mode', { code: errors.CODES.CONFIG_INVALID });
        }
        _brainMode = mode;
        _emit('brain:mode', { brain: _currentBrain, mode });
    }
    return _brainMode;
}

// List available brain directories
function brainDirs(type = 'all') {
    const brains = { public: [], private: [] };
    
    // Scan public brains
    const publicRoot = _brainRoots.public;
    if (fs.existsSync(publicRoot)) {
        const entries = fs.readdirSync(publicRoot, { withFileTypes: true });
        brains.public = entries.filter(e => e.isDirectory()).map(e => e.name);
    }
    
    // Check for geometry brain (special quasicrystal-addressed storage)
    const geometryPath = 'models/private/geometry';
    if (fs.existsSync(geometryPath)) {
        brains.geometry = true;  // Geometry brain available
    }
    
    // Scan private brains  
    const privateRoot = _brainRoots.private;
    if (fs.existsSync(privateRoot)) {
        const entries = fs.readdirSync(privateRoot, { withFileTypes: true });
        brains.private = entries.filter(e => e.isDirectory()).map(e => e.name);
    }
    
    if (type === 'public') return brains.public;
    if (type === 'private') return brains.private;
    return brains;
}

// Switch to a different brain
// This also adds the brain to top of stack for dual mode fallback
function switchBrain(name, type = 'private') {
    if (!name) {
        throw new errors.VantError('Brain name required', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    
    // Auto-detect type if not specified
    if (type === 'private') {
        const privatePath = _brainRoots.private + '/' + name;
        if (fs.existsSync(privatePath)) {
            type = 'private';
        } else {
            const publicPath = _brainRoots.public + '/' + name;
            if (fs.existsSync(publicPath)) {
                type = 'public';
            } else {
                throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_LOAD_FAIL });
            }
        }
    }
    
    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
    const brainPath = root + '/' + name;
    
    if (!fs.existsSync(brainPath)) {
        throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }
    
    // Use loadStack to properly update the stack
    // This ensures the change persists
    let newStack;
    if (!_brainStack.includes(name)) {
        // Add to top
        newStack = [name, ..._brainStack];
    } else {
        // Move to top
        const idx = _brainStack.indexOf(name);
        newStack = [name, ..._brainStack.slice(0, idx), ..._brainStack.slice(idx + 1)];
    }
    loadStack(newStack);
    
    // Clear brain cache when switching brains
    // This ensures fresh loading from the new brain
    _brainCache.clear();
    // Also clear external cache module
    const cache = getCache();
    if (cache?.clear) {
        cache.clear();
    }
    
    _currentBrain = name;
    _currentBrainType = type;
    _emit('brain:switched', { brain: name, type, mode: _brainMode });
    
    return { brain: name, type, mode: _brainMode, stack: getStack() };
}

// ==================== PATH CONSISTENCY ====================
function getBrainPath() {
    // Check for VANT_BRAIN env override first
    const envBrain = process.env.VANT_BRAIN;
    if (envBrain) {
        return _brainRoots.private + '/' + envBrain;
    }

    // Skip registry - use our multi-brain system directly
    // (registry has its own DEFAULT_BRAIN that conflicts)
    
    // Use config system base path
    let basePath = 'models/private';
    try {
        const config = require('./config');
        basePath = config.get('storage.path') || 'models/private';
    } catch (e) {}

    // Default to current brain (use correct root based on type)
    const brainRoot = _currentBrainType === 'public' ? _brainRoots.public : basePath;
    const brainPath = brainRoot + '/' + _currentBrain;

    // SECURITY: Use vaf for path validation
    const vaf = _getVaf();
    if (vaf?.checkPathTraversal) {
        const check = vaf.checkPathTraversal(brainPath);
        if (check.blocked) {
            brainPath = 'models/private/' + _currentBrain;
        }
    }
    return brainPath;
}

function getPublicPath() {
    // FIX: Return public brain path with smart defaults
    // Priority: 1) Config default  2) vant (if exists)  3) First public brain in stack
    const privateRoot = _brainRoots.private;
    const publicRoot = _brainRoots.public;
    
    // 1. Check config for default public brain
    let defaultPublicBrain = 'vant'; // Default
    try {
        const config = require('./config');
        const configured = config.get('brain.defaultPublic');
        if (configured && typeof configured === 'string') {
            defaultPublicBrain = configured;
        }
    } catch(e) { /* config not available, use default */ }
    
    // 2. Check if configured/default brain exists
    const configuredPath = publicRoot + '/' + defaultPublicBrain;
    if (fs.existsSync(configuredPath)) {
        return configuredPath;
    }
    
    // 3. Look for vant specifically (common default)
    const vantPath = publicRoot + '/vant';
    if (fs.existsSync(vantPath)) {
        return vantPath;
    }
    
    // 4. Find first public brain in stack
    for (const brainName of _brainStack) {
        const publicPath = publicRoot + '/' + brainName;
        if (fs.existsSync(publicPath)) {
            return publicPath;
        }
    }
    
    // 5. Last resort: return public root
    return publicRoot;
}

// ==================== CORE LOADING ====================

/**
 * Load a single brain file
 * @param {string} name - Brain name (without .md)
 * @returns {Promise<Object|null>} Brain object or null
 */
async function _loadBrain(name) {
    // Guard against null/undefined - return null gracefully
    if (!name || typeof name !== 'string') {
        return null;
    }
    
    const start = Date.now();
    // Resolve alias
    const resolved = resolve(name);
    
    // Check cache first
    const cached = _getCached(resolved);
    if (cached) {
        _metrics.cacheHits++;
        _metrics.loads++;
        
        // EVENT: brain cache hit
        _emit('brain:cache:hit', { name: resolved, timestamp: Date.now() });
        
        return cached;
    }
    
    // EVENT: brain loading
    _emit('brain:loading', { name: resolved, source: _mode, timestamp: Date.now() });
    
    _metrics.loads++;
    await emit('beforeLoad', { name: resolved, original: name });
    
    // Pipeline execution via context
    const ctx = { name: resolved, original: name };
    await executePipeline(_mode, ctx, async () => {
        // Mode switch: routing
        if (_mode === 'public') {
            const publicFile = path.join(getPublicPath(), resolved + '.md');
            if (await fs.promises.access(publicFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(publicFile, 'utf8'), source: 'public', brain: _currentBrain };
            }
        } else if (_mode === 'private') {
            const privateFile = path.join(getBrainPath(), resolved + '.md');
            if (await fs.promises.access(privateFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(privateFile, 'utf8'), source: 'private', brain: _currentBrain };
            }
        } else if (_mode === 'remote' && _remoteURL) {
            try {
                const remote = await _fetchRemote(resolved);
                if (remote) {
                    ctx.result = { name: resolved, content: remote.content, source: 'remote' };
                }
            } catch (e) { console.warn("[brain] Remote fetch failed:", e.message); }
        } else {
            // Dual mode: check current brain first, then fall back to stack
            let found = null;
            
            // First, check current brain (if set)
            if (_currentBrain) {
                const currentPath = resolveBrainPath(_currentBrain);
                if (currentPath) {
                    const currentFile = path.join(currentPath.path, resolved + '.md');
                    if (await fs.promises.access(currentFile).then(() => true).catch(() => false)) {
                        found = {
                            name: resolved,
                            content: await fs.promises.readFile(currentFile, 'utf8'),
                            source: currentPath.type,
                            brain: _currentBrain
                        };
                    }
                }
            }
            
            // If not found in current brain, check stack (fallback)
            if (!found) {
                const stack = getStack();
                for (const brainName of stack) {
                    const resolvedPath = resolveBrainPath(brainName);
                    if (!resolvedPath) continue;

                    const brainFile = path.join(resolvedPath.path, resolved + '.md');
                    if (await fs.promises.access(brainFile).then(() => true).catch(() => false)) {
                        found = {
                            name: resolved,
                            content: await fs.promises.readFile(brainFile, 'utf8'),
                            source: resolvedPath.type,
                            brain: brainName
                        };
                        break;
                    }
                }
            }

            if (found) {
                ctx.result = found;
            }
        }
    });
    // Check result
    let brain = ctx.result || null;
    
    if (!brain) {
        // Emit onMiss hooks
        await emit('onMiss', { name: resolved, original: name });
        // Try fallback
        return _heal(resolved);
    }
    
    // Cache result
    _setCached(resolved, brain);
    
    // Apply load transformers
    brain = await applyTransforms('load', brain);
    
    // Emit afterLoad hooks
    await emit('afterLoad', { brain, name: resolved });
    
    // EVENT: brain loaded
    _emit('brain:loaded', { name: resolved, source: brain?.source, timestamp: Date.now() });
    
// === FIRE NEURONS: track access, boost attention, preload ===
    const _lastBrain = _lastLoaded || null;
    if (_lastBrain && _lastBrain !== resolved) {
        fireSynapse(_lastBrain, resolved);
    }
    _lastLoaded = resolved;
    // Boost attention on access
    const currentAttention = getAttention(resolved) || 0;
    attend(resolved, Math.min(1, currentAttention + 0.2));
    // Preload next predicted brain
    const predicted = predictNext(resolved);
    if (predicted) {
        preload(resolved).catch(e => console.warn("[brain] Preload failed:", e.message));
    }

    // Track load time
    _metrics.loadTime += Date.now() - start;

    // Save state on each load
    _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                attention: Object.fromEntries(_attention) });

    return brain;
}

/**
 * Load all brains as merged corpus (ASYNC)
 * @returns {Array} Array of brain objects
 */
/**
 * Unified readDir - reads directory for brain files
 * @param {string} dirPath - Directory path to read
 * @param {string} source - Source name (public/private/brainName)
 * @param {object} opts - Options: { sync: boolean, onFile: function }
 * @returns {Promise<Array>|Array} Array of file entries
 */
function readDir(dirPath, source, opts = {}) {
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];
    const results = [];
    
    const processFile = (file, fullPath) => {
        const ext = path.extname(file).toLowerCase();
        if (!extensions.includes(ext)) return null;
        
        const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
        const formatName = ext === '.md' ? 'md' : 
                         ext === '.json' ? 'json' : 
                         ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';
        
        if (opts.onFile) {
            // Callback mode for loadCorpus
            return opts.onFile({ name, content: null, source, format: formatName, fullPath });
        }
        
        return { name, format: formatName, source };
    };
    
    if (opts.sync) {
        // SYNC MODE
        try {
            if (!fs.existsSync(dirPath)) return results;
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const result = processFile(file, fullPath);
                if (result) {
                    result.content = fs.readFileSync(fullPath, 'utf8');
                    results.push(result);
                }
            }
        } catch (e) { /* ignore errors */ }
        return results;
    } else {
        // ASYNC MODE (default)
        return (async () => {
            try {
                if (!await fs.promises.access(dirPath).then(() => true).catch(() => false)) return results;
                const files = await fs.promises.readdir(dirPath);
                for (const file of files) {
                    const fullPath = path.join(dirPath, file);
                    const result = processFile(file, fullPath);
                    if (result) {
                        result.content = await fs.promises.readFile(fullPath, 'utf8');
                        results.push(result);
                    }
                }
            } catch (e) { /* ignore errors */ }
            return results;
        })();
    }
}

/**
 * Unified loadCorpus - load all brain files
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<Array>|Array} Array of brain objects
 * 
 * Pattern: Single function, async default, {sync:true} for sync mode
 */
function loadCorpus(opts = {}) {
    const isSync = opts.sync === true;

    // Return cached synchronously if available
    if (_corpusCache && _corpusCacheMode === _mode) {
        return isSync ? _corpusCache : Promise.resolve(_corpusCache);
    }

    const brainPath = getBrainPath();
    const publicPath = getPublicPath();

    // Rate limit (async only)
    if (!isSync) {
        const qos = getHandler('qos');
        if (qos?.check) qos.check('brain').catch(() => {});
    }

    // SYNC version - synchronous execution
    if (isSync) {
        const brain = {};

        const processDir = (dirPath, source) => {
            const files = readDir(dirPath, source, { sync: true });
            for (const { name, content, format } of files) {
                if (source === 'private' || !brain[name]) {
                    brain[name] = { content, source, format };
                }
            }
        };

        if (_mode === 'public') {
            processDir(publicPath, 'public');
        } else if (_mode === 'private') {
            processDir(brainPath, 'private');
        } else {
            processDir(publicPath, 'public');
            processDir(brainPath, 'private');
        }

        _corpusCache = Object.entries(brain).map(([name, { content, source, format }]) => ({
            id: name, title: name, content, format, source, type: 'brain'
        }));
        _corpusCacheMode = _mode;

        return _corpusCache;
    }

    // ASYNC version - await the promises properly
    return (async () => {
        const brain = {};

        const processDir = async (dirPath, source) => {
            const files = await readDir(dirPath, source, { sync: false });
            for (const { name, content, format } of files) {
                if (source === 'private' || !brain[name]) {
                    brain[name] = { content, source, format };
                }
            }
        };

        if (_mode === 'public') {
            await processDir(publicPath, 'public');
        } else if (_mode === 'private') {
            await processDir(brainPath, 'private');
        } else {
            await processDir(publicPath, 'public');
            await processDir(brainPath, 'private');
        }

        _corpusCache = Object.entries(brain).map(([name, { content, source, format }]) => ({
            id: name, title: name, content, format, source, type: 'brain'
        }));
        _corpusCacheMode = _mode;

        return _corpusCache;
    })();
}

/**
 * MULTIBRAIN: Unified loadStackCorpus - Load corpus from ALL brains in stack
 * Returns merged corpus with source tracking per brain
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<Array>|Array} Array of brain objects with brain name tracking
 */
function loadStackCorpus(opts = {}) {
    const isSync = opts.sync === true;
    const stack = getStack();
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];
    
    const processFiles = (files, brainName) => {
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (!extensions.includes(ext)) continue;
            
            const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
            const formatName = ext === '.md' ? 'md' : 
                             ext === '.json' ? 'json' : 
                             ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';
            
            let content;
            if (isSync) {
                content = fs.readFileSync(path.join(dirPath, file), 'utf8');
            } else {
                content = fs.promises.readFile(path.join(dirPath, file), 'utf8');
            }
            
            return {
                id: name + '|' + brainName,
                title: name,
                content,
                format: formatName,
                source: brainName,
                brain: brainName,
                type: 'brain'
            };
        }
    };
    
    // This is simplified - actual implementation uses unified readDir
    // For now, just delegate to the async/sync versions for compatibility
    if (isSync) {
        const results = [];
        for (const brainName of stack) {
            const brainInfo = resolveBrainPath(brainName);
            if (brainInfo && brainInfo.path) {
                const dirPath = brainInfo.path;
                try {
                    if (!fs.existsSync(dirPath)) continue;
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        const ext = path.extname(file).toLowerCase();
                        if (!extensions.includes(ext)) continue;
                        
                        const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
                        const formatName = ext === '.md' ? 'md' : ext === '.json' ? 'json' : 'txt';
                        const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
                        results.push({
                            id: name + '|' + brainName,
                            title: name,
                            content,
                            format: formatName,
                            source: brainName,
                            brain: brainName,
                            type: 'brain'
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        return results;
    } else {
        return (async () => {
            const results = [];
            for (const brainName of stack) {
                const brainInfo = resolveBrainPath(brainName);
                if (brainInfo && brainInfo.path) {
                    const dirPath = brainInfo.path;
                    try {
                        if (!await fs.promises.access(dirPath).then(() => true).catch(() => false)) continue;
                        const files = await fs.promises.readdir(dirPath);
                        for (const file of files) {
                            const ext = path.extname(file).toLowerCase();
                            if (!extensions.includes(ext)) continue;
                            
                            const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
                            const formatName = ext === '.md' ? 'md' : ext === '.json' ? 'json' : 'txt';
                            const content = await fs.promises.readFile(path.join(dirPath, file), 'utf8');
                            results.push({
                                id: name + '|' + brainName,
                                title: name,
                                content,
                                format: formatName,
                                source: brainName,
                                brain: brainName,
                                type: 'brain'
                            });
                        }
                    } catch (e) { /* ignore */ }
                }
            }
            return results;
        })();
    }
}

/**
 * Check if brain exists (ASYNC)
 * @param {string} name - Brain name
 * @returns {Promise<string|null>} Source
 */
async function hasBrain(name) {
    // Guard against null/undefined
    if (!name || typeof name !== 'string') {
        return null;
    }
    
    const resolved = resolve(name);
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    
    if (await fs.promises.access(path.join(brainPath, resolved + '.md')).then(() => true).catch(() => false)) {
        return 'private';
    }
    if (await fs.promises.access(path.join(publicPath, resolved + '.md')).then(() => true).catch(() => false)) {
        return 'public';
    }
    return null;
}

/**
 * Get list of available brains (ASYNC)
 * @param {string} [type] - Filter
 * @returns {Promise<Array>} Brain names
 */
async function brainFiles(type) {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const names = new Set();
    
    async function addBrains(dirPath) {
        if (!await fs.promises.access(dirPath).then(() => true).catch(() => false)) return;
        const files = await fs.promises.readdir(dirPath);
        for (const f of files) {
            if (f.endsWith('.md')) names.add(f.replace('.md', ''));
        }
    }
    
    if (!type || type === 'public') {
        await addBrains(publicPath);
    }
    
    if (!type || type === 'private') {
        await addBrains(brainPath);
    }
    
    return Array.from(names).sort();
}

/**
 * Get brain version
 */
function getVersion() {
    return '0.8.6';
}

/**
 * Get identity from corpus
 */
async function getIdentity() {
    const item = await load('identity');
    if (item) {
        const content = item.content || '';
        const nameMatch = content.match(/NAME:\s*(\w+)/);
        const roleMatch = content.match(/ROLE:\s*([^\n]+)/);
        return {
            name: nameMatch?.[1] || 'Agent',
            role: roleMatch?.[1] || 'AI Agent',
            source: item.source
        };
    }
    return { name: 'Agent', role: 'AI Agent', source: 'default' };
}

// ==================== STORAGE FORWARDERS ====================
let _storageRef = null;
function _getStorageRef() {
    if (!_storageRef) _storageRef = require('./storage');
    return _storageRef;
}

function getBrainStorage() {
    return _getStorageRef().get('brain');
}

/**
 * Write with security chain (VAF → QoS → Escrow)
 * All writes go through security by default
 */
async function write(category, key, content, options = {}) {
    // Support writing to specific brain via options.brain
    if (options.brain) {
        const brainType = options.type || 'private';
        return _writeToBrain(options.brain, brainType, category, key, content);
    }
    
    // SECURITY: Run VAF → QoS → Escrow chain
    const qosCleanup = await _runBrainSecurityChain('write', { 
        type: 'write', 
        category, 
        key, 
        content: content || '',
        userCtx: options.userCtx,
        habitat: options.habitat
    });
    try {
        // Emit beforeSave hooks
        emit('beforeSave', { category, key, content });
        const result = _getStorageRef().get('brain').write(category, key, content);
        // Emit afterSave hooks
        emit('afterSave', { category, key, content });
        if (qosCleanup) qosCleanup();
        return result;
    } catch (e) {
        if (qosCleanup) qosCleanup();
        throw e;
    }
}

/**
 * Load with security chain (VAF → QoS)
 * All reads go through security by default
 */
async function load(name, options = {}) {
    // Support loading from specific brain via options.brain
    if (options.brain) {
        const brainType = options.type || 'private';
        const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
        const brainPath = root + '/' + options.brain;
        
        // Use BrainStorage for the target brain (proper architecture)
        const { BrainStorage } = require('./storage');
        const targetStorage = new BrainStorage({ basePath: brainPath });
        
        // Support category/key format
        const parts = name.includes('/') ? name.split('/') : ['learnings', name];
        const category = parts[0];
        const key = parts[1];
        
        const result = await targetStorage.get(category, key + '.md');
        if (result) {
            return { name, content: result, source: options.brain };
        }
        return null;
    }
    
    // Recursion guard: prevent infinite brain load loops
    const depthCheck = guard.check('brain:load:' + name);
    if (!depthCheck.allowed) {
        throw new errors.VantError('Recursion depth exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }
    
    // SECURITY: Run VAF → QoS chain
    const qosCleanup = await _runBrainSecurityChain('load', { 
        type: 'read', 
        category: '', 
        key: name,
        userCtx: options.userCtx,
        habitat: options.habitat
    });
    try {
        const result = await _loadBrain(name, options);
        
        // Auto-track brain loads in evolution session
        if (result && result.name) {
            recordChange('load', { 
                name: result.name, 
                source: result.source, 
                brain: result.brain 
            });
        }
        
        if (qosCleanup) qosCleanup();
        return result;
    } catch (e) {
        if (qosCleanup) qosCleanup();
        throw e;
    } finally {
        guard.release('brain:load:' + name);
    }
}

function append(key, content) {
    return _getStorageRef().get('brain').append(key, content);
}

function get(category, key, options = {}) {
    // RLS per-record ACL check (REQUIRED)
    if (!options.userCtx) {
        throw new errors.VantError('userCtx required', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    _checkRead(options.userCtx, '_brain:' + category + ':' + key);

    const result = _getStorageRef().get('brain').get(category, key, {
        userCtx: options.userCtx,
        decryptKey: options.decryptKey
    });

    // OPTIONAL: Decrypt at rest
    if (result && result._encrypted && options.decryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            try {
                result.data = Encrypt.decrypt(result.data, options.decryptKey);
            } catch (e) {
                return { error: 'decryption failed', category, key };
            }
        }
    }

    return result;
}

// ==================== PRELOAD CORPUS ====================
// Pre-load corpus on startup for sync access (fire and forget)
setImmediate(() => {
    loadCorpus().catch(() => {}); // Ignore errors - cache will be empty
});

// Auto-start evolution session on first brain interaction
setImmediate(() => {
    try {
        startEvolutionSession('auto-' + Date.now());
    } catch (e) {}
});

// ==================== EXPORTS ====================
module.exports = {
    // Registry
    register,
    getHandler,
    listHandlers,
    
    // Pipeline
    getPipeline,
    setPipeline,
    addMiddleware,
    removeMiddleware,
    executePipeline,
    getPipelineState,
    
    // Hooks
    on,
    off,
    emit,
    
    // Aliases
    alias,
    resolve,
    listAliases,
    
    // Transformers
    transform,
    applyTransforms,
    
    // Cache
    setCache,
    invalidateCache,
    getCacheStats,
    
    // Watcher
    setWatch,
    isWatching,
    
    // Metrics
    getMetrics,
    resetMetrics,
    
    // Lifecycle
    onBootstrap,
    bootstrap,
    onShutdown,
    shutdown,
    
    // Neurons
    fireSynapse,
    predictNext,
    getSynapses,
    attend,
    getAttention,
    attendBySemantic,  // NEW: semantic attention boost
    metabolize,
    dream,
    onFail,
    preload,
    forget,

    // State persistence
    getNeuronState,
    saveNeuronState,
    restoreNeuronState,
    _setSkipSave,
    
    // Paths
    getBrainPath,
    getPublicPath,
    currentBrain,
    brainMode,
    brainDirs,
    switchBrain,
    loadStack,
    getStack,
    pushBrain,
    removeBrain,
    
    merge,
    writeTo,
    geoLoad,
    geoStore,
    geoList,
    geoBrains,
    resolveBrainPath,

    // Evolution (vertical learning)
    startEvolutionSession,
    endEvolutionSession,
    getEvolutionSession,
    recordChange,
    recordInsight,
    getEvolutionChanges,
    getEvolutionInsights,
    getEvolutionHistory,
    
    // Multi-brain helpers (v0.8.6)
    brainList: () => brainDirs(),  // Alias for backwards compat
    listBrains: () => {
        // Return array of all brain names (public + private)
        const dirs = brainDirs();
        return [...dirs.public, ...dirs.private];
    },
    brainCurrent: () => currentBrain(),
    brainNeurons: () => {
        // Return per-brain neuron state
        const synapses = getSynapses();
        // Get attention for all brains in stack
        const attention = {};
        const stack = getStack();
        for (const brain of stack) {
            attention[brain] = getAttention(brain);
        }
        // Predict next brain for each brain in stack
        const predictions = {};
        for (const brain of stack) {
            const next = predictNext(brain);
            if (next) predictions[brain] = next;
        }
        return { synapses, attention, predictions };
    },
    brainSaveNeurons: (data) => {
        // Save neuron state back to state.json
        // Data should have: { synapses?, attention?, predictions? }
        if (!data || typeof data !== 'object') {
            return { error: 'data required' };
        }
        const current = getNeuronState().then(neurons => {
            const updated = { ...neurons };
            if (data.synapses) updated.synapses = data.synapses;
            if (data.attention) updated.attention = data.attention;
            return saveNeuronState(updated);
        });
        return { saving: true, promise: current };
    },
    
    // Core loading
    load,
    read,  // NEW (v0.8.6): Unified read with format support
    loadFile,  // NEW (v0.8.6): File load via format.js
    saveFile,  // NEW (v0.8.6): File save via format.js
    loadCorpus,  // v0.8.6: use {sync:true} for sync mode
    loadStackCorpus,  // v0.8.6: use {sync:true} for sync mode
    hasBrain,
    brainFiles,
    
    // Mode switch
    getMode,
    setMode,
    getRemoteURL,
    setRemoteURL,
    
    // Version & identity
    getVersion,
    getIdentity,
    
    // Storage forwarders
    getBrainStorage,
    write,
    append,
    get,

    // Module access
    getModule,
    
    // Sandbox brain handlers
    _wireBrainToSandbox,
    
    // NEW: Stego backup/restore (like brain-horcrux)
    async backupToImage(imagePath) {
        // Backup brain to PNG image via stego
        const stego = require('./stego');
        return await stego.encodeBrain(imagePath);
    },
    
    async restoreFromImage(imagePath) {
        // Restore brain from PNG image via stego
        const stego = require('./stego');
        return await stego.decodeBrain(imagePath);
    },
    
    listBackups() {
        // List available backup images in storage
        const path = require('path');
        const fs = require('fs');
        const storage = getBrainStorage();
        const dir = path.join(storage, 'backups');
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    },
    
    // NEW: brain.myStuff - user's personal brain data
    myStuff() {
        // Get user's personal brain data (identity, goals, lessons, etc)
        const fs = require('fs');
        const path = require('path');
        const privatePath = getBrainPath();
        
        const files = ['identity.md', 'goals.md', 'lessons.md', 'preferences.md', 'errors.md'];
        const stuff = {};
        
        for (const file of files) {
            const filePath = path.join(privatePath, file);
            if (fs.existsSync(filePath)) {
                stuff[file.replace('.md', '')] = fs.readFileSync(filePath, 'utf8');
            }
        }
        
        return { ...stuff, loaded: Object.keys(stuff), count: Object.keys(stuff).length };
    },
    
    updateMyStuff(key, content) {
        // Update a personal brain file
        const fs = require('fs');
        const path = require('path');
        const privatePath = getBrainPath();
        const filePath = path.join(privatePath, `${key}.md`);
        
        fs.writeFileSync(filePath, content);
        return { updated: key, success: true };
    },
    
    // myStuff also has dropbox (private version)
    myDropFile(name, content) {
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const myPath = path.join(storage, 'private', 'myStuff');
        if (!fs.existsSync(myPath)) fs.mkdirSync(myPath, { recursive: true });
        fs.writeFileSync(path.join(myPath, name), content);
        return { saved: name, type: 'myStuff' };
    },
    
    myGetFile(name) {
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const filePath = path.join(storage, 'private', 'myStuff', name);
        if (!fs.existsSync(filePath)) return { error: 'not found' };
        return { name, content: fs.readFileSync(filePath, 'utf8'), type: 'myStuff' };
    },
    
    myListFiles() {
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const myPath = path.join(storage, 'private', 'myStuff');
        if (!fs.existsSync(myPath)) return { files: [], type: 'myStuff' };
        return { files: fs.readdirSync(myPath).map(f => ({ name: f })), type: 'myStuff' };
    },
    
    myDeleteFile(name) {
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const filePath = path.join(storage, 'private', 'myStuff', name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return { deleted: name, type: 'myStuff' };
    },
    
    // NEW: brain.yourStuff - temp stash (work in progress)
    yourStuff() {
        // Get temp stash of work in progress
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const tmpPath = path.join(storage, 'tmp', 'yourStuff.json');
        
        if (!fs.existsSync(tmpPath)) return { stash: null, empty: true };
        
        try { return JSON.parse(fs.readFileSync(tmpPath, 'utf8')); } catch (e) { console.warn("[brain] yourStuff parse:", e.message); return { stash: null, empty: true }; }
    },
    
    stashYourStuff(data) {
        // Stash temp work in progress
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const tmpDir = path.join(storage, 'tmp');
        
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        
        const tmpPath = path.join(tmpDir, 'yourStuff.json');
        fs.writeFileSync(tmpPath, JSON.stringify({ ...data, stashed: Date.now() }, null, 2));
        
        return { stashed: true };
    },
    
    clearYourStuff() {
        // Clear temp stash
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const tmpPath = path.join(storage, 'tmp', 'yourStuff.json');
        
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        
        return { cleared: true };
    },
    
    // NEW: brain.yourStuff as handler (stream, msg events)
    onStream(handler) {
        // Register stream handler
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const handlersPath = path.join(storage, 'tmp', 'handlers.json');
        
        const handlers = fs.existsSync(handlersPath) 
            ? JSON.parse(fs.readFileSync(handlersPath, 'utf8'))
            : {};
        handlers.stream = handler.toString();
        fs.writeFileSync(handlersPath, JSON.stringify(handlers, null, 2));
        
        return { registered: 'stream', success: true };
    },
    
    onMessage(handler) {
        // Register message handler
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const handlersPath = path.join(storage, 'tmp', 'handlers.json');
        
        const handlers = fs.existsSync(handlersPath) 
            ? JSON.parse(fs.readFileSync(handlersPath, 'utf8'))
            : {};
        handlers.message = handler.toString();
        fs.writeFileSync(handlersPath, JSON.stringify(handlers, null, 2));
        
        return { registered: 'message', success: true };
    },
    
    getHandlers() {
        // Get registered handlers
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const handlersPath = path.join(storage, 'tmp', 'handlers.json');
        
        if (!fs.existsSync(handlersPath)) return { stream: null, message: null };
        return JSON.parse(fs.readFileSync(handlersPath, 'utf8'));
    },
    
    clearHandlers() {
        // Clear all handlers
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const handlersPath = path.join(storage, 'tmp', 'handlers.json');
        
        if (fs.existsSync(handlersPath)) fs.unlinkSync(handlersPath);
        
        return { cleared: true };
    },
    
    // NEW: brain.yourStuff as Dropbox (quick share)
    dropFile(name, content) {
        // Quick file share (text or data)
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const dropPath = path.join(storage, 'tmp', 'dropbox');
        
        if (!fs.existsSync(dropPath)) fs.mkdirSync(dropPath, { recursive: true });
        
        const filePath = path.join(dropPath, name);
        fs.writeFileSync(filePath, content);
        
        return { saved: name, path: filePath };
    },
    
    getFile(name) {
        // Get shared file
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const dropPath = path.join(storage, 'tmp', 'dropbox', name);
        
        if (!fs.existsSync(dropPath)) return { error: 'not found' };
        
        return { name, content: fs.readFileSync(dropPath, 'utf8') };
    },
    
    listFiles() {
        // List shared files in dropbox
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const dropPath = path.join(storage, 'tmp', 'dropbox');
        
        if (!fs.existsSync(dropPath)) return { files: [] };
        
        const files = fs.readdirSync(dropPath).map(f => {
            const stat = fs.statSync(path.join(dropPath, f));
            return { name: f, size: stat.size, mtime: stat.mtime };
        });
        
        return { files };
    },
    
    deleteFile(name) {
        // Delete shared file
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const filePath = path.join(storage, 'tmp', 'dropbox', name);
        
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        return { deleted: name };
    },
    
    clearDropbox() {
        // Clear all shared files
        const fs = require('fs');
        const path = require('path');
        const storage = getBrainStorage().path || './storage';
        const dropPath = path.join(storage, 'tmp', 'dropbox');
        
        if (fs.existsSync(dropPath)) {
            fs.rmSync(dropPath, { recursive: true, force: true });
        }
        
        return { cleared: true };
    }
};