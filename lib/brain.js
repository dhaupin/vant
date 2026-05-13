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
const path = require('path');

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
 * Execute pipeline
 * @param {string} mode - Brain mode
 * @param {object} ctx - Context object
 * @param {function} final - Final handler
 */
async function executePipeline(mode, ctx, final) {
    const chain = getPipeline(mode);
    for (const name of chain) {
        const handler = getHandler(name);
        if (!handler) continue;
        try {
            // Execute handler if it's a function
            if (typeof handler === 'function') {
                await handler(ctx);
            } else if (typeof handler?.run === 'function') {
                await handler.run(ctx);
            } else if (typeof handler?.check === 'function') {
                await handler.check(ctx);
            } else if (typeof handler?.can === 'function') {
                try {
                    const result = handler.can(ctx.name);
                    if (!result) {
                        throw new Error(`Pipeline blocked: ${name}`);
                    }
                } catch (e) {
                    // Sandbox may throw if not initialized - skip gracefully
                }
            }
        } catch (e) {
            // Skip if handler throws (not available)
            if (e.message?.includes('not allowed') || e.message?.includes('blocked')) {
                throw e;
            }
            // Otherwise continue
        }
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
    // GC cache if over threshold
    if (_cache.size > _metabolism.gcThreshold) {
        for (const [name, { ts }] of _cache) {
            if (Date.now() - ts > _cacheTTL) {
                _cache.delete(name);
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
}

/**
 * Process dream job
 */
async function _processDream(payload) {
    const corpus = loadCorpus();
    const learnings = corpus.find(c => c.id === 'learnings');
    const lessons = corpus.find(c => c.id === 'lessons');
    if (learnings && lessons) {
        return { learnings, lessons };
    }
}

// ==================== SELF-HEALING ====================
// Auto-retry with fallback on failure
const _fallbacks = new Map(); // brain -> fallback brain

/**
 * Register fallback brain
 */
function onFail(brain, fallback) {
    _fallbacks.set(brain, fallback);
}

/**
 * Auto-heal - retry with fallback
 */
async function _heal(brain) {
    const fallback = _fallbacks.get(brain);
    if (fallback) {
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
function preload(brain) {
    const prediction = predictNext(brain);
    if (prediction) {
        _preloadQueue.push(prediction);
    }
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
    _cache.delete(brain);
    // Prune incoming synapses
    for (const [from, weights] of _synapses) {
        weights.delete(brain);
    }
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
    for (const fn of _lifecycle.bootstrap) {
        await fn();
    }
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
            if (fs.existsSync(publicFile)) {
                ctx.result = { name: resolved, content: fs.readFileSync(publicFile, 'utf8'), source: 'public' };
            }
        } else if (_mode === 'private') {
            const privateFile = path.join(getBrainPath(), resolved + '.md');
            if (fs.existsSync(privateFile)) {
                ctx.result = { name: resolved, content: fs.readFileSync(privateFile, 'utf8'), source: 'private' };
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
            
            if (fs.existsSync(privateFile)) {
                ctx.result = { name: resolved, content: fs.readFileSync(privateFile, 'utf8'), source: 'private' };
            } else if (fs.existsSync(publicFile)) {
                ctx.result = { name: resolved, content: fs.readFileSync(publicFile, 'utf8'), source: 'public' };
            }
        }
    });
    
    // Check result
    let brain = ctx.result || null;
    
    if (!brain) {
        // Emit onMiss hooks
        await emit('onMiss', { name: resolved, original: name });
        return null;
    }
    
    // Cache result
    _setCached(resolved, brain);
    
    // Apply load transformers
    brain = await applyTransforms('load', brain);
    
    // Emit afterLoad hooks
    await emit('afterLoad', { brain, name: resolved });
    
    // Track load time
    _metrics.loadTime += Date.now() - start;
    
    return brain;
}

/**
 * Load all brains as merged corpus
 * @returns {Array} Array of brain objects
 */
function loadCorpus() {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const brain = {};
    
    // Rate limit
    const qos = getHandler('qos');
    if (qos?.check) qos.check('brain').catch(() => {});
    
    // Mode: public only
    if (_mode === 'public') {
        if (fs.existsSync(publicPath)) {
            fs.readdirSync(publicPath)
                .filter(f => f.endsWith('.md'))
                .forEach(file => {
                    const name = file.replace('.md', '');
                    brain[name] = {
                        content: fs.readFileSync(path.join(publicPath, file), 'utf8'),
                        source: 'public'
                    };
                });
        }
        return Object.entries(brain).map(([name, { content, source }]) => ({
            id: name,
            title: name,
            content,
            source,
            type: 'brain'
        }));
    }
    
    // Mode: private only
    if (_mode === 'private') {
        if (fs.existsSync(brainPath)) {
            fs.readdirSync(brainPath)
                .filter(f => f.endsWith('.md'))
                .forEach(file => {
                    const name = file.replace('.md', '');
                    brain[name] = {
                        content: fs.readFileSync(path.join(brainPath, file), 'utf8'),
                        source: 'private'
                    };
                });
        }
        return Object.entries(brain).map(([name, { content, source }]) => ({
            id: name,
            title: name,
            content,
            source,
            type: 'brain'
        }));
    }
    
    // Default: dual (public base + private overrides)
    if (fs.existsSync(publicPath)) {
        fs.readdirSync(publicPath)
            .filter(f => f.endsWith('.md'))
            .forEach(file => {
                const name = file.replace('.md', '');
                brain[name] = {
                    content: fs.readFileSync(path.join(publicPath, file), 'utf8'),
                    source: 'public'
                };
            });
    }
    
    if (fs.existsSync(brainPath)) {
        fs.readdirSync(brainPath)
            .filter(f => f.endsWith('.md'))
            .forEach(file => {
                const name = file.replace('.md', '');
                brain[name] = {
                    content: fs.readFileSync(path.join(brainPath, file), 'utf8'),
                    source: 'private'
                };
            });
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
 * Check if brain exists
 * @param {string} name - Brain name
 * @returns {string|null} Source
 */
function hasBrain(name) {
    const resolved = resolve(name);
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    
    if (fs.existsSync(path.join(brainPath, resolved + '.md'))) {
        return 'private';
    }
    if (fs.existsSync(path.join(publicPath, resolved + '.md'))) {
        return 'public';
    }
    return null;
}

/**
 * Get list of available brains
 * @param {string} [type] - Filter
 * @returns {Array} Brain names
 */
function listBrains(type) {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const names = new Set();
    
    if (!type || type === 'public') {
        if (fs.existsSync(publicPath)) {
            fs.readdirSync(publicPath)
                .filter(f => f.endsWith('.md'))
                .forEach(f => names.add(f.replace('.md', '')));
        }
    }
    
    if (!type || type === 'private') {
        if (fs.existsSync(brainPath)) {
            fs.readdirSync(brainPath)
                .filter(f => f.endsWith('.md'))
                .forEach(f => names.add(f.replace('.md', '')));
        }
    }
    
    return Array.from(names).sort();
}

/**
 * Get brain version
 */
function getVersion() {
    return '0.8.7';
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
    get
};