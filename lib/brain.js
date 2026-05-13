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

/**
 * Register a hook
 * @param {string} event - Hook event
 * @param {function} fn - Handler function
 */
function on(event, fn) {
    if (_hooks[event]) {
        _hooks[event].push(fn);
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
// In-memory brain cache
const _cache = new Map();
let _cacheEnabled = true;
let _cacheTTL = 60000; // 1 minute default

/**
 * Enable/disable cache
 */
function setCache(enabled, ttl) {
    _cacheEnabled = enabled !== false;
    if (ttl) _cacheTTL = ttl;
}

/**
 * Get cached brain
 * @param {string} name - Brain name
 * @returns {object|null} Cached brain or null
 */
function _getCached(name) {
    if (!_cacheEnabled) return null;
    const entry = _cache.get(name);
    if (!entry) return null;
    // Check TTL
    if (Date.now() - entry.ts > _cacheTTL) {
        _cache.delete(name);
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
    _cache.set(name, { data, ts: Date.now() });
}

/**
 * Invalidate cache
 * @param {string} [name] - Specific brain or all
 */
function invalidateCache(name) {
    if (name) {
        _cache.delete(name);
    } else {
        _cache.clear();
    }
}

/**
 * Get cache stats
 */
function getCacheStats() {
    const entries = [];
    for (const [name, { ts }] of _cache) {
        entries.push({ name, age: Date.now() - ts });
    }
    return {
        size: _cache.size,
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
let _storage = null;
function _getStorage() {
    if (!_storage) _storage = require('./storage');
    return _storage;
}

function getBrainStorage() {
    return _getStorage().get('brain');
}

function write(category, key, content) {
    // Emit beforeSave hooks
    emit('beforeSave', { category, key, content });
    const result = _getStorage().get('brain').write(category, key, content);
    // Emit afterSave hooks
    emit('afterSave', { category, key, content });
    return result;
}

function append(key, content) {
    return _getStorage().get('brain').append(key, content);
}

function get(category, key) {
    return _getStorage().get('brain').get(category, key);
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