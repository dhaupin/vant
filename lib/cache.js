const errors = require('./error');
/**
 * Vant Cache (v0.8.6)
 * Unified in-memory cache, compression, and buffer pool
 * WITH EVENT EMISSIONS - cache operations emit for reactivity
 *
 * MERGED: memoize.js + cache.js + compression.js + pool.js
 *
 * Usage:
 *   const cache = require('./cache');
 *   cache.set('key', value, { ttl: 60000 });
 *   const value = cache.get('key');
 *   const compressed = cache.compress(data);
 */

const path = require('path');
const zlib = require('zlib');


// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// ==================== LRU CACHE ====================
const _cache = new Map();
const _timestamps = new Map();
const _accessOrder = [];

// Simple lock for cache state
let _cacheLock = Promise.resolve();

async function _withLock(fn) {
    let result;
    _cacheLock = _cacheLock.then(async () => {
        result = await fn();
    });
    await _cacheLock;
    return result;
}

// Auto-chain through sandbox for capability + RLS
function _getSandbox() {
    let s = null;
    try { s = require('./sandbox'); } catch (e) {}
    return s;
}

function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('ECAP: write not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkWrite(userCtx, resource, 'write');
    }
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}


let _config = {
    maxSize: 1000,
    defaultTTL: 3600000, // 1 hour
    enableCompression: true
};

/**
 * Configure cache
 */
function configure(options = {}) {
    if (options.maxSize) _config.maxSize = options.maxSize;
    if (options.defaultTTL) _config.defaultTTL = options.defaultTTL;
    if (options.enableCompression !== undefined) _config.enableCompression = options.enableCompression;
    return _config;
}

/**
 * Set cache entry
 */
function set(key, value, options = {}) {
    return _withLock(() => _set(key, value, options));
}

function _set(key, value, options = {}) {
    const ttl = options.ttl || _config.defaultTTL;

    // SECURITY: Validate key
    if (!key || typeof key !== 'string' || key.length > 256) {
        throw new errors.VantError('EINVAL: invalid cache key', { code: errors.CODES.CONFIG_INVALID });
    }

    // SECURITY: Prevent memory exhaustion - max value size (10MB)
    const MAX_VALUE_SIZE = 10 * 1024 * 1024;
    const valueSize = typeof value === 'string' ? value.length : JSON.stringify(value).length;
    if (valueSize > MAX_VALUE_SIZE) {
        throw new errors.VantError('EFBIG: cache value too large (max 10MB)', { code: errors.CODES.UNKNOWN });
    }

    // Evict if full
    if (_cache.size >= _config.maxSize && !_cache.has(key)) {
        const oldestKey = _accessOrder.shift();
        if (oldestKey) {
            _cache.delete(oldestKey);
            _timestamps.delete(oldestKey);
            _emit('cache:evicted', { key: oldestKey });
        }
    }

    // Optional compression before storing large values
    let storedValue = value;
    if (_config.enableCompression && options.compress !== false && typeof value === 'string' && value.length > 1024) {
        storedValue = zlib.gzipSync(Buffer.from(value)).toString('base64');
    }

    _cache.set(key, storedValue);
    _timestamps.set(key, Date.now() + ttl);
    _accessOrder.push(key);

    // EVENT: cache:set
    _emit('cache:set', { key, size: storedValue?.length || 0, compressed: storedValue !== value });

    return { key, compressed: storedValue !== value };
}

/**
 * Get cache entry
 */
function get(key, options = {}) {
    if (options.userCtx) {
        _checkRead(options.userCtx, '_cache:get:' + key);
    }
    const now = Date.now();
    const expiry = _timestamps.get(key);

    // Check expiry
    if (expiry && now > expiry) {
        _cache.delete(key);
        _timestamps.delete(key);
        const idx = _accessOrder.indexOf(key);
        if (idx > -1) _accessOrder.splice(idx, 1);

        // EVENT: cache:expired
        _emit('cache:expired', { key });

        return undefined;
    }

    const value = _cache.get(key);
    if (!value) {
        // EVENT: cache:miss
        _emit('cache:miss', { key });
        return undefined;
    }

    // Refresh access time
    _timestamps.set(key, now + (expiry - now));

    // Decompress if needed (check for base64 gzip)
    if (options.decompress !== false && typeof value === 'string' && /^[A-Za-z0-9+/=]+$/.test(value)) {
        try {
            return zlib.gunzipSync(Buffer.from(value, 'base64')).toString();
        } catch (e) {
            return value;
        }
    }

    // EVENT: cache:hit
    _emit('cache:hit', { key });

    return value;
}

/**
 * Delete cache entry
 */
function remove(key) {
    const existed = _cache.has(key);
    const idx = _accessOrder.indexOf(key);
    if (idx > -1) _accessOrder.splice(idx, 1);
    _timestamps.delete(key);
    const deleted = _cache.delete(key);

    if (deleted) {
        _emit('cache:removed', { key });
    }

    return deleted;
}

/**
 * Clear cache
 */
function clear() {
    const cleared = _cache.size;
    _cache.clear();
    _timestamps.clear();
    _accessOrder.length = 0;

    // EVENT: cache:cleared
    _emit('cache:cleared', { count: cleared });
}

/**
 * Flush cache to persistent storage
 * (For DUALITY: temp → persist bridge)
 */
function flush(options = {}) {
    const entries = [];
    for (const [key, value] of _cache) {
        entries.push({ key, value, timestamp: _timestamps.get(key) });
    }

    // EVENT: cache:flushing
    _emit('cache:flushing', { count: entries.length });

    _cache.clear();
    _timestamps.clear();
    _accessOrder.length = 0;

    // EVENT: cache:flushed
    _emit('cache:flushed', { count: entries.length, entries: entries.map(e => e.key) });

    return entries;
}

/**
 * Check if key exists
 */
function has(key) {
    return _cache.has(key);
}

/**
 * Get cache size
 */
function size() {
    return _cache.size;
}

/**
 * Get cache stats
 */
function stats() {
    return {
        size: _cache.size,
        maxSize: _config.maxSize,
        defaultTTL: _config.defaultTTL,
        hitRate: 0 // Could track hits
    };
}

// ==================== COMPRESSION ====================
/**
 * Compress data
 */
function compress(data, algorithm = 'gzip') {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    return algorithm === 'gzip' ? zlib.gzipSync(buf) : zlib.deflateSync(buf);
}

/**
 * Decompress data
 */
function decompress(data, algorithm = 'gzip') {
    return algorithm === 'gzip' ? zlib.gunzipSync(data) : zlib.inflateSync(data);
}

// ==================== BUFFER POOL ====================
const _pools = new Map();

/**
 * Create buffer pool
 */
function createPool(name, options = {}) {
    const size = options.size || 10;
    const factory = options.factory || (() => Buffer.alloc(options.bufferSize || 1024));

    const pool = {
        name,
        size,
        factory,
        available: [],
        inUse: new Set()
    };

    for (let i = 0; i < size; i++) {
        pool.available.push(factory());
    }

    _pools.set(name, pool);
    return pool;
}

/**
 * Acquire from pool
 */
function acquire(name) {
    const pool = _pools.get(name);
    if (!pool) return null;
    if (pool.available.length > 0) {
        const buf = pool.available.pop();
        pool.inUse.add(buf);
        return buf;
    }
    return pool.factory();
}

/**
 * Release to pool
 */
function release(name, buffer) {
    const pool = _pools.get(name);
    if (!pool || !buffer) return;
    pool.inUse.delete(buffer);
    if (pool.available.length < pool.size) {
        pool.available.push(buffer);
    }
}

// Lazy load pipeline for unified security chain (v0.9.0-axolotl)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) {}
    }
    return _pipeline;
}

// ==================== v0.9.0-axolotl PIPELINE-BACKED VARIANTS ====================
// Async versions of the cache API that route every call through the unified
// security pipeline (sandbox -> vaf -> qos -> escrow). New code should prefer
// these over the sync variants.
async function setSecured(key, value, options = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return set(key, value, options);
    return pipeline.run(
        { name: 'cache.set', operation: 'write', input: key, key },
        async () => set(key, value, options),
        { mode: pipeline.PRIVATE }
    );
}

async function getSecured(key, options = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return get(key, options);
    return pipeline.run(
        { name: 'cache.get', operation: 'read', input: key, key },
        async () => get(key, options),
        { mode: pipeline.PUBLIC }
    );
}

async function removeSecured(key) {
    const pipeline = _getPipeline();
    if (!pipeline) return remove(key);
    return pipeline.run(
        { name: 'cache.remove', operation: 'delete', input: key, key },
        async () => remove(key),
        { mode: pipeline.PRIVATE }
    );
}

async function clearSecured() {
    const pipeline = _getPipeline();
    if (!pipeline) return clear();
    return pipeline.run(
        { name: 'cache.clear', operation: 'delete', input: 'cache:all' },
        async () => clear(),
        { mode: pipeline.PRIVATE }
    );
}

// ==================== EXPORTS ====================
module.exports = {
    // LRU Cache
    configure,
    set,
    get,
    remove,
    clear,
    flush,  // DUALITY: get entries for persistence
    has,
    size,
    stats,

    // v0.9.0-axolotl pipeline-backed variants
    setSecured,
    getSecured,
    removeSecured,
    clearSecured,

    // Compression
    compress,
    decompress,

    // Buffer Pool
    createPool,
    acquire,
    release,

    // Framework interface
    getLayerStatus: () => ({ name: 'Cache', type: 'unified-cache', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, size: _cache.size, maxSize: _config.maxSize }),

    // Multibrain
    getBrainCache,
    setBrainCache,
    clearBrainCache,

    // Multibrain Stack
    getStackCacheStats
};

// ==================== MULTIBRAIN SUPPORT ====================

function getBrainCache(key) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    const brainCache = _brainCaches[brainName] || {};
    return brainCache[key];
}

function setBrainCache(key, value) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    if (!_brainCaches[brainName]) {
        _brainCaches[brainName] = {};
    }
    _brainCaches[brainName][key] = value;
    return true;
}

function clearBrainCache() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainCaches[brainName] = {};
    return true;
}

// Brain-specific cache storage
const _brainCaches = {};

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackCacheStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const cacheStats = stats();
            results.byBrain[brainName] = cacheStats;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}
