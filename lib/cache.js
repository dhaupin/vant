/**
 * Vant Cache (v0.8.6)
 * Unified in-memory cache, compression, and buffer pool
 * 
 * MERGED: memoize.js + cache.js + compression.js + pool.js
 * 
 * Usage:
 *   const cache = require('./cache');
 *   cache.set('key', value, { ttl: 60000 });
 *   const value = cache.get('key');
 *   const compressed = cache.compress(data);
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ==================== LRU CACHE ====================
const _cache = new Map();
const _timestamps = new Map();
const _accessOrder = [];

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
    const ttl = options.ttl || _config.defaultTTL;
    
    // Evict if full
    if (_cache.size >= _config.maxSize && !_cache.has(key)) {
        const oldestKey = _accessOrder.shift();
        if (oldestKey) {
            _cache.delete(oldestKey);
            _timestamps.delete(oldestKey);
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
    
    return { key, compressed: storedValue !== value };
}

/**
 * Get cache entry
 */
function get(key, options = {}) {
    const now = Date.now();
    const expiry = _timestamps.get(key);
    
    // Check expiry
    if (expiry && now > expiry) {
        _cache.delete(key);
        _timestamps.delete(key);
        const idx = _accessOrder.indexOf(key);
        if (idx > -1) _accessOrder.splice(idx, 1);
        return undefined;
    }
    
    const value = _cache.get(key);
    if (!value) return undefined;
    
    // Decompress if needed (check for base64 gzip)
    if (options.decompress !== false && typeof value === 'string' && /^[A-Za-z0-9+/=]+$/.test(value)) {
        try {
            return zlib.gunzipSync(Buffer.from(value, 'base64')).toString();
        } catch (e) {
            return value;
        }
    }
    
    return value;
}

/**
 * Delete cache entry
 */
function remove(key) {
    const idx = _accessOrder.indexOf(key);
    if (idx > -1) _accessOrder.splice(idx, 1);
    _timestamps.delete(key);
    return _cache.delete(key);
}

/**
 * Clear cache
 */
function clear() {
    _cache.clear();
    _timestamps.clear();
    _accessOrder.length = 0;
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

// ==================== EXPORTS ====================
module.exports = {
    // LRU Cache
    configure,
    set,
    get,
    remove,
    clear,
    has,
    size,
    stats,
    
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
    getStatus: () => ({ enabled: true, size: _cache.size, maxSize: _config.maxSize })
};