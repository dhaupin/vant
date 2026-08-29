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
 *
 *   // Isolated instance (v0.9.0-axolotl)
 *   const { Cache } = require('./cache');
 *   const myCache = new Cache({ maxSize: 50, defaultTTL: 30000 });
 *   myCache.set('a', 1);
 *   // does not affect the module-level cache
 */

const path = require('path');
const zlib = require('zlib');


// ==================== EVENT SYSTEM ====================
let _eventModule = null;
function _emit(event, data) {
    if (!_eventModule) {
        try { _eventModule = require('./event'); } catch (e) { return; }
    }
    if (_eventModule && _eventModule.emit) {
        _eventModule.emit(event, data);
    }
}

// Auto-chain through sandbox for capability + RLS
function _getSandbox() {
    let s = null;
    try { s = require('./sandbox'); } catch (e) {}
    return s;
}

function _checkWrite(userCtx, resource) {
    const s = _getSandbox();
    if (!s) return;
    if (typeof s.check === 'function') {
        s.check(userCtx, 'write', resource);
    } else if (typeof s.can === 'function') {
        if (!s.can(userCtx, 'write', resource)) {
            throw new errors.VantError('EFORBIDDEN: write not allowed', { code: errors.CODES.FORBIDDEN });
        }
    }
}

function _checkRead(userCtx, resource) {
    const s = _getSandbox();
    if (!s) return;
    if (typeof s.check === 'function') {
        s.check(userCtx, 'read', resource);
    } else if (typeof s.can === 'function') {
        if (!s.can(userCtx, 'read', resource)) {
            throw new errors.VantError('EFORBIDDEN: read not allowed', { code: errors.CODES.FORBIDDEN });
        }
    }
}

// ==================== CACHE CLASS ====================
class Cache {
    constructor(options = {}) {
        this._cache = new Map();
        this._timestamps = new Map();
        this._accessOrder = [];
        this._cacheLock = Promise.resolve();
        this._pools = new Map();
        this._brainCaches = {};
        this._config = {
            maxSize: options.maxSize || 1000,
            defaultTTL: options.defaultTTL || 3600000,
            enableCompression: options.enableCompression !== undefined ? options.enableCompression : true
        };
        this._pipeline = null;
    }

    get pipeline() {
        if (!this._pipeline) {
            try { this._pipeline = require('./pipeline'); } catch (e) {}
        }
        return this._pipeline;
    }

    async _withLock(fn) {
        let result;
        this._cacheLock = this._cacheLock.then(async () => {
            result = await fn();
        });
        await this._cacheLock;
        return result;
    }

    configure(options = {}) {
        if (options.maxSize) this._config.maxSize = options.maxSize;
        if (options.defaultTTL) this._config.defaultTTL = options.defaultTTL;
        if (options.enableCompression !== undefined) this._config.enableCompression = options.enableCompression;
        return this._config;
    }

    /**
     * Set cache entry
     */
    set(key, value, options = {}) {
        return this._withLock(() => this._set(key, value, options));
    }

    _set(key, value, options = {}) {
        const ttl = options.ttl || this._config.defaultTTL;

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
        if (this._cache.size >= this._config.maxSize && !this._cache.has(key)) {
            const oldestKey = this._accessOrder.shift();
            if (oldestKey) {
                this._cache.delete(oldestKey);
                this._timestamps.delete(oldestKey);
                _emit('cache:evicted', { key: oldestKey });
            }
        }

        // Optional compression before storing large values
        let storedValue = value;
        if (this._config.enableCompression && options.compress !== false && typeof value === 'string' && value.length > 1024) {
            storedValue = zlib.gzipSync(Buffer.from(value)).toString('base64');
        }

        this._cache.set(key, storedValue);
        this._timestamps.set(key, Date.now() + ttl);
        this._accessOrder.push(key);

        _emit('cache:set', { key, size: storedValue?.length || 0, compressed: storedValue !== value });

        return { key, compressed: storedValue !== value };
    }

    /**
     * Get cache entry
     */
    get(key, options = {}) {
        if (options.userCtx) {
            _checkRead(options.userCtx, '_cache:get:' + key);
        }
        const now = Date.now();
        const expiry = this._timestamps.get(key);

        // Check expiry
        if (expiry && now > expiry) {
            this._cache.delete(key);
            this._timestamps.delete(key);
            const idx = this._accessOrder.indexOf(key);
            if (idx > -1) this._accessOrder.splice(idx, 1);

            _emit('cache:expired', { key });

            return undefined;
        }

        const value = this._cache.get(key);
        if (!value) {
            _emit('cache:miss', { key });
            return undefined;
        }

        this._timestamps.set(key, now + (expiry - now));

        if (options.decompress !== false && typeof value === 'string' && /^[A-Za-z0-9+/=]+$/.test(value)) {
            try {
                return zlib.gunzipSync(Buffer.from(value, 'base64')).toString();
            } catch (e) {
                return value;
            }
        }

        _emit('cache:hit', { key });

        return value;
    }

    /**
     * Delete cache entry
     */
    remove(key) {
        const existed = this._cache.has(key);
        const idx = this._accessOrder.indexOf(key);
        if (idx > -1) this._accessOrder.splice(idx, 1);
        this._timestamps.delete(key);
        const deleted = this._cache.delete(key);

        if (deleted) {
            _emit('cache:removed', { key });
        }

        return deleted;
    }

    /**
     * Clear cache
     */
    clear() {
        const cleared = this._cache.size;
        this._cache.clear();
        this._timestamps.clear();
        this._accessOrder.length = 0;

        _emit('cache:cleared', { count: cleared });
    }

    /**
     * Flush cache to persistent storage
     * (For DUALITY: temp → persist bridge)
     */
    flush(options = {}) {
        const entries = [];
        for (const [key, value] of this._cache) {
            entries.push({ key, value, timestamp: this._timestamps.get(key) });
        }

        _emit('cache:flushing', { count: entries.length });

        this._cache.clear();
        this._timestamps.clear();
        this._accessOrder.length = 0;

        _emit('cache:flushed', { count: entries.length, entries: entries.map(e => e.key) });

        return entries;
    }

    has(key) { return this._cache.has(key); }
    size() { return this._cache.size; }
    stats() {
        return {
            size: this._cache.size,
            maxSize: this._config.maxSize,
            defaultTTL: this._config.defaultTTL,
            hitRate: 0
        };
    }

    // ==================== COMPRESSION ====================
    compress(data, algorithm = 'gzip') {
        let buf;
        if (Buffer.isBuffer(data)) {
            buf = data;
        } else if (typeof data === 'string') {
            buf = Buffer.from(data, 'utf8');
        } else {
            buf = Buffer.from(JSON.stringify(data));
        }
        return algorithm === 'gzip' ? zlib.gzipSync(buf) : zlib.deflateSync(buf);
    }

    decompress(data, algorithm = 'gzip') {
        return algorithm === 'gzip' ? zlib.gunzipSync(data) : zlib.inflateSync(data);
    }

    // ==================== BUFFER POOL ====================
    createPool(name, options = {}) {
        const size = options.size || 16;
        const bufferSize = options.bufferSize || 4096;
        const pool = {
            name,
            size,
            bufferSize,
            available: [],
            inUse: 0
        };
        this._pools.set(name, pool);
        return pool;
    }

    acquire(name) {
        let pool = this._pools.get(name);
        if (!pool) pool = this.createPool(name);
        if (pool.available.length > 0) {
            const buf = pool.available.pop();
            pool.inUse++;
            return buf;
        }
        if (pool.inUse < pool.size * 2) {
            pool.inUse++;
            return Buffer.allocUnsafe(pool.bufferSize);
        }
        return null;
    }

    release(name, buffer) {
        const pool = this._pools.get(name);
        if (!pool) return false;
        pool.inUse = Math.max(0, pool.inUse - 1);
        if (pool.available.length < pool.size) {
            pool.available.push(buffer);
        }
        return true;
    }

    // ==================== PIPELINE-BACKED VARIANTS ====================
    async setSecured(key, value, options = {}) {
        const pipeline = this.pipeline;
        if (!pipeline) return this.set(key, value, options);
        return pipeline.run(
            { name: 'cache.set', operation: 'write', input: key, key },
            async () => this.set(key, value, options),
            { mode: pipeline.PRIVATE }
        );
    }

    async getSecured(key, options = {}) {
        const pipeline = this.pipeline;
        if (!pipeline) return this.get(key, options);
        return pipeline.run(
            { name: 'cache.get', operation: 'read', input: key, key },
            async () => this.get(key, options),
            { mode: pipeline.PUBLIC }
        );
    }

    async removeSecured(key) {
        const pipeline = this.pipeline;
        if (!pipeline) return this.remove(key);
        return pipeline.run(
            { name: 'cache.remove', operation: 'delete', input: key, key },
            async () => this.remove(key),
            { mode: pipeline.PRIVATE }
        );
    }

    async clearSecured() {
        const pipeline = this.pipeline;
        if (!pipeline) return this.clear();
        return pipeline.run(
            { name: 'cache.clear', operation: 'delete', input: 'cache:all' },
            async () => this.clear(),
            { mode: pipeline.PRIVATE }
        );
    }

    // ==================== MULTIBRAIN SUPPORT ====================
    getBrainCache(key) {
        const brain = require('./brain');
        const brainName = brain.getCurrentBrain();
        const brainCache = this._brainCaches[brainName] || {};
        return brainCache[key];
    }

    setBrainCache(key, value) {
        const brain = require('./brain');
        const brainName = brain.getCurrentBrain();
        if (!this._brainCaches[brainName]) {
            this._brainCaches[brainName] = {};
        }
        this._brainCaches[brainName][key] = value;
        return true;
    }

    clearBrainCache() {
        const brain = require('./brain');
        const brainName = brain.getCurrentBrain();
        this._brainCaches[brainName] = {};
        return true;
    }

    getStackCacheStats() {
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
                results.byBrain[brainName] = this.stats();
            } catch (e) {
                results.byBrain[brainName] = { error: e.message };
            } finally {
                brain.removeBrain();
            }
        }
        return results;
    }

    // Framework interface
    getLayerStatus() {
        return { name: 'Cache', type: 'unified-cache', version: '0.8.6', enabled: true };
    }
    isOperationAllowed() { return { allowed: true }; }
    getStatus() { return { enabled: true, size: this._cache.size, maxSize: this._config.maxSize }; }
}

// ==================== DEFAULT SINGLETON (backward compat) ====================
const _default = new Cache();

module.exports = {
    Cache,

    configure: (opts) => _default.configure(opts),
    set: (k, v, opts) => _default.set(k, v, opts),
    get: (k, opts) => _default.get(k, opts),
    remove: (k) => _default.remove(k),
    clear: () => _default.clear(),
    flush: (opts) => _default.flush(opts),
    has: (k) => _default.has(k),
    size: () => _default.size(),
    stats: () => _default.stats(),

    setSecured: (k, v, opts) => _default.setSecured(k, v, opts),
    getSecured: (k, opts) => _default.getSecured(k, opts),
    removeSecured: (k) => _default.removeSecured(k),
    clearSecured: () => _default.clearSecured(),

    compress: (d, a) => _default.compress(d, a),
    decompress: (d, a) => _default.decompress(d, a),

    createPool: (n, opts) => _default.createPool(n, opts),
    acquire: (n) => _default.acquire(n),
    release: (n, b) => _default.release(n, b),

    getLayerStatus: () => _default.getLayerStatus(),
    isOperationAllowed: () => _default.isOperationAllowed(),
    getStatus: () => _default.getStatus(),

    getBrainCache: (k) => _default.getBrainCache(k),
    setBrainCache: (k, v) => _default.setBrainCache(k, v),
    clearBrainCache: () => _default.clearBrainCache(),

    getStackCacheStats: () => _default.getStackCacheStats()
};
