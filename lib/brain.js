/**
 * Brain Router v2 - Unified Brain Loading System
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
 */

const fs = require('fs');
const sudo = require('./sudo');
const path = require('path');

const _statePath = path.join(__dirname, '..', 'models', 'state.json');

// ==================== STATE PERSISTENCE (ASYNC ONLY) ====================
async function _loadState() {
    try {
        const content = await fs.promises.readFile(_statePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return { neurons: {} };
    }
}

async function _saveState(state) {
    const current = await _loadState();
    current.neurons = { ...current.neurons, ...state };
    current.updated = new Date().toISOString();
    await fs.promises.writeFile(_statePath, JSON.stringify(current, null, 2));
}

function getNeuronState() {
    return _loadState().then(s => s.neurons || {});
}

function saveNeuronState(state) {
    return _saveState({ neurons: state });
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
const getEvent = () => { if (!_event) try { _event = require('./event'); } catch (e) {} return _event; };

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
    _handlers.set(name, handler);
    _registry.set(name, { handler, registered: new Date().toISOString() });
}

/**
 * Get a registered handler
 * @param {string} name - Handler name
 * @returns {object|null} Handler
 */
function getHandler(name) {
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
            } else if (typeof handler?.check === 'function') {
                result = await handler.check(ctx.name);
            } else if (typeof handler?.can === 'function') {
                // Sandbox can() returns boolean, check capability
                try {
                    result = handler.can(ctx.name);
                    if (!result) {
                        throw new Error(`Pipeline blocked: ${name} denied access to ${ctx.name}`);
                    }
                } catch (e) {
                    if (isCritical) throw e;
                    getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name}.can() failed - ${e.message}`);
                    continue;
                }
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

// ==================== MODE SWITCH ====================
let _mode = 'dual';
let _remoteURL = null;

function getMode() { return _mode; }
function setMode(mode) {
    if (['dual', 'public', 'private', 'remote'].includes(mode)) {
        _mode = mode;
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
    } catch (e) { /* ignore */ }
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
    
    return { consolidated: insights.length };
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
        return loadBrain(fallback);
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
        return loadBrain(prediction).then(loaded => loaded || { id: prediction, name: prediction });
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
        if (!cached) loadBrain(brain).catch(() => {});
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

// ==================== PATH CONSISTENCY ====================
function getBrainPath() {
    let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || process.env.VANT_STORAGE_PATH || 'models/private';
    if (brainPath.startsWith('/') || brainPath.includes('..')) {
        brainPath = 'models/private';
    }
    return brainPath;
}

function getPublicPath() {
    return 'models/public';
}

// ==================== CORE LOADING ====================

/**
 * Load a single brain file
 * @param {string} name - Brain name (without .md)
 * @returns {Promise<Object|null>} Brain object or null
 */
async function loadBrain(name) {
    const start = Date.now();
    // Resolve alias
    const resolved = resolve(name);
    
    // Check cache first
    const cached = _getCached(resolved);
    if (cached) {
        _metrics.cacheHits++;
        _metrics.loads++;
        return cached;
    }
    
    _metrics.loads++;
    await emit('beforeLoad', { name: resolved, original: name });
    
    // Pipeline execution via context
    const ctx = { name: resolved, original: name };
    await executePipeline(_mode, ctx, async () => {
        // Mode switch: routing
        if (_mode === 'public') {
            const publicFile = path.join(getPublicPath(), resolved + '.md');
            if (await fs.promises.access(publicFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(publicFile, 'utf8'), source: 'public' };
            }
        } else if (_mode === 'private') {
            const privateFile = path.join(getBrainPath(), resolved + '.md');
            if (await fs.promises.access(privateFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(privateFile, 'utf8'), source: 'private' };
            }
        } else if (_mode === 'remote' && _remoteURL) {
            try {
                const remote = await _fetchRemote(resolved);
                if (remote) {
                    ctx.result = { name: resolved, content: remote.content, source: 'remote' };
                }
            } catch (e) { /* fall through */ }
        } else {
            // Default: dual (private overrides public)
            const brainPath = getBrainPath();
            const publicPath = getPublicPath();
            const privateFile = path.join(brainPath, resolved + '.md');
            const publicFile = path.join(publicPath, resolved + '.md');
            
            if (await fs.promises.access(privateFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(privateFile, 'utf8'), source: 'private' };
            } else if (await fs.promises.access(publicFile).then(() => true).catch(() => false)) {
                ctx.result = { name: resolved, content: await fs.promises.readFile(publicFile, 'utf8'), source: 'public' };
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
        preload(resolved).catch(() => {});
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
async function loadCorpus() {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const brain = {};
    
    // Rate limit
    const qos = getHandler('qos');
    if (qos?.check) qos.check('brain').catch(() => {});
    
    // Helper: read directory async
    async function readDirAsync(dirPath, source) {
        if (!await fs.promises.access(dirPath).then(() => true).catch(() => false)) return;
        const files = await fs.promises.readdir(dirPath);
        for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const name = file.replace('.md', '');
            const content = await fs.promises.readFile(path.join(dirPath, file), 'utf8');
            // Private overrides public in dual mode
            if (source === 'private' || !brain[name]) {
                brain[name] = { content, source };
            }
        }
    }
    
    // Load based on mode
    if (_mode === 'public') {
        await readDirAsync(publicPath, 'public');
    } else if (_mode === 'private') {
        await readDirAsync(brainPath, 'private');
    } else {
        // Dual mode: public first, then private overrides
        await readDirAsync(publicPath, 'public');
        await readDirAsync(brainPath, 'private');
    }
    
    return Object.entries(brain).map(([name, { content, source }]) => ({
        id: name,
        title: name,
        content,
        source,
        type: 'brain'
    }));
}

/**
 * Check if brain exists (ASYNC)
 * @param {string} name - Brain name
 * @returns {Promise<string|null>} Source
 */
async function hasBrain(name) {
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
async function listBrains(type) {
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
    const item = await loadBrain('identity');
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

function write(category, key, content) {
    // Emit beforeSave hooks
    emit('beforeSave', { category, key, content });
    const result = _getStorageRef().get('brain').write(category, key, content);
    // Emit afterSave hooks
    emit('afterSave', { category, key, content });
    return result;
}

function append(key, content) {
    return _getStorageRef().get('brain').append(key, content);
}

function get(category, key) {
    return _getStorageRef().get('brain').get(category, key);
}

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
    metabolize,
    dream,
    onFail,
    preload,
    forget,

    // State persistence
    getNeuronState,
    saveNeuronState,
    
    // Paths
    getBrainPath,
    getPublicPath,
    
    // Core loading
    loadBrain,
    loadCorpus,
    hasBrain,
    listBrains,
    
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
        
        return JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
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