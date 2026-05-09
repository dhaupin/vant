/**
 * Memoize (v0.8.6)
 * In-memory caching with TTL, LRU
 *
 * Merged: memoize + cache patterns
 */

const _cache = new Map();
const _timestamps = new Map();
let _maxSize = 1000;
let _defaultTTL = 3600000; // 1 hour

function set(key, value, ttl = _defaultTTL) {
    if (_cache.size >= _maxSize) {
        const oldest = _timestamps.keys().next().value;
        _cache.delete(oldest);
        _timestamps.delete(oldest);
    }
    _cache.set(key, value);
    _timestamps.set(key, Date.now() + ttl);
}

function get(key) {
    const value = _cache.get(key);
    if (!value) return null;
    if (Date.now() > (_timestamps.get(key) || 0)) {
        _cache.delete(key);
        _timestamps.delete(key);
        return null;
    }
    return value;
}

function has(key) { return get(key) !== null; }
function del(key) { _cache.delete(key); _timestamps.delete(key); }
function clear() { _cache.clear(); _timestamps.clear(); }
function size() { return _cache.size; }

function configure(options = {}) {
    if (options.maxSize) _maxSize = options.maxSize;
    if (options.defaultTTL) _defaultTTL = options.defaultTTL;
}

module.exports = { set, get, has, del, clear, size, configure, getLayerStatus: () => ({ name: 'Memoize', type: 'cache', enabled: true }), isOperationAllowed: (op) => ({ allowed: true, layer: 'Memoize' }), getStatus: () => ({ enabled: true }) };
