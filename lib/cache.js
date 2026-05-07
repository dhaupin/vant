/**
 * Vant Cache Class
 * 
 * Unified cache with LRU eviction and TTL expiration
 * Thread-safe, memory-bounded, optional persistence
 * 
 * Usage:
 *   const cache = require('./cache');
 *   
 *   // Basic usage
 *   cache.set('key', 'value', { ttl: 60000 }); // 60 second TTL
 *   const value = cache.get('key');
 *   
 *   // With options
 *   const myCache = cache.create({ maxSize: 1000, ttl: 300000 });
 *   
 *   // Check allowed
 *   cache.isOperationAllowed('read');
 *   cache.getLayerStatus();
 */

/**
 * Cache Entry with metadata
 */
class CacheEntry {
    constructor(value, ttl = null) {
        this.value = value;
        this.timestamp = Date.now();
        this.ttl = ttl;
        this.hits = 0;
    }
    
    isExpired() {
        if (!this.ttl) return false;
        return Date.now() - this.timestamp > this.ttl;
    }
    
    access() {
        this.hits++;
    }
}

/**
 * Cache Class
 * Provides unified cache with LRU and TTL
 */
class Cache {
    /**
     * Create Cache instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            maxSize: options.maxSize || 1000,
            defaultTTL: options.defaultTTL || null, // null = no expiration
            namespace: options.namespace || '',
            onEvict: options.onEvict || null, // callback on eviction
            persist: options.persist || false
        };
        
        // Internal storage
        this._cache = new Map(); // key → CacheEntry
        this._accessOrder = []; // LRU order
        
        // Stats
        this._stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            expirations: 0,
            sets: 0,
            gets: 0
        };
        
        // State
        this._startTime = Date.now();
    }
    
    /**
     * Get value from cache
     */
    get(key) {
        const fullKey = this._makeKey(key);
        this._stats.gets++;
        
        const entry = this._cache.get(fullKey);
        if (!entry) {
            this._stats.misses++;
            return null;
        }
        
        // Check expiration
        if (entry.isExpired()) {
            this._delete(fullKey);
            this._stats.expirations++;
            return null;
        }
        
        // Update LRU
        this._accessOrder = this._accessOrder.filter(k => k !== fullKey);
        this._accessOrder.push(fullKey);
        
        entry.access();
        this._stats.hits++;
        
        return entry.value;
    }
    
    /**
     * Set value in cache
     */
    set(key, value, options = {}) {
        const fullKey = this._makeKey(key);
        const ttl = options.ttl !== undefined ? options.ttl : this.options.defaultTTL;
        
        // Delete existing
        if (this._cache.has(fullKey)) {
            this._delete(fullKey);
        }
        
        // Evict if at capacity
        while (this._cache.size >= this.options.maxSize) {
            this._evictLRU();
        }
        
        // Create entry
        const entry = new CacheEntry(value, ttl);
        this._cache.set(fullKey, entry);
        this._accessOrder.push(fullKey);
        
        this._stats.sets++;
        
        return this;
    }
    
    /**
     * Delete key from cache
     */
    delete(key) {
        const fullKey = this._makeKey(key);
        return this._delete(fullKey);
    }
    
    /**
     * Internal delete
     */
    _delete(fullKey) {
        this._cache.delete(fullKey);
        this._accessOrder = this._accessOrder.filter(k => k !== fullKey);
    }
    
    /**
     * Evict least recently used
     */
    _evictLRU() {
        if (this._accessOrder.length === 0) return;
        
        const oldest = this._accessOrder.shift();
        this._cache.delete(oldest);
        this._stats.evictions++;
        
        // Callback
        if (this.options.onEvict) {
            const key = this._stripNamespace(oldest);
            this.options.onEvict(key);
        }
    }
    
    /**
     * Check if key exists (and not expired)
     */
    has(key) {
        const fullKey = this._makeKey(key);
        const entry = this._cache.get(fullKey);
        if (!entry) return false;
        if (entry.isExpired()) {
            this._delete(fullKey);
            this._stats.expirations++;
            return false;
        }
        return true;
    }
    
    /**
     * Clear all cache
     */
    clear() {
        this._cache.clear();
        this._accessOrder = [];
        return this;
    }
    
    /**
     * Prune expired entries
     */
    prune() {
        const now = Date.now();
        let pruned = 0;
        
        for (const [key, entry] of this._cache) {
            if (entry.isExpired()) {
                this._cache.delete(key);
                this._accessOrder = this._accessOrder.filter(k => k !== key);
                pruned++;
            }
        }
        
        this._stats.expirations += pruned;
        return pruned;
    }
    
    /**
     * Get cache stats
     */
    getStats() {
        return {
            ...this._stats,
            size: this._cache.size,
            maxSize: this.options.maxSize,
            hitRate: this._stats.gets > 0 
                ? (this._stats.hits / this._stats.gets * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * Get keys
     */
    keys() {
        return this._accessOrder.map(k => this._stripNamespace(k));
    }
    
    /**
     * Make full key with namespace
     */
    _makeKey(key) {
        return this.options.namespace 
            ? `${this.options.namespace}:${key}` 
            : key;
    }
    
    /**
     * Strip namespace from key
     */
    _stripNamespace(fullKey) {
        if (this.options.namespace) {
            return fullKey.replace(`${this.options.namespace}:`, '');
        }
        return fullKey;
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Cache',
            type: 'cache',
            enabled: true,
            config: {
                maxSize: this.options.maxSize,
                defaultTTL: this.options.defaultTTL,
                namespace: this.options.namespace
            },
            state: {
                size: this._cache.size,
                uptime: Date.now() - this._startTime,
                stats: this.getStats()
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'Cache'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: true,
            size: this._cache.size,
            maxSize: this.options.maxSize
        };
    }
}

/**
 * Default Cache instance
 */
const defaultCache = new Cache();

module.exports = {
    // Class
    Cache,
    CacheEntry,
    
    /**
     * Create Cache instance
     */
    create(options = {}) {
        return new Cache(options);
    },
    
    // Methods
    get(key) {
        return defaultCache.get(key);
    },
    
    set(key, value, options) {
        return defaultCache.set(key, value, options);
    },
    
    delete(key) {
        return defaultCache.delete(key);
    },
    
    has(key) {
        return defaultCache.has(key);
    },
    
    clear() {
        return defaultCache.clear();
    },
    
    prune() {
        return defaultCache.prune();
    },
    
    getStats() {
        return defaultCache.getStats();
    },
    
    keys() {
        return defaultCache.keys();
    },
    
    // Class methods
    getLayerStatus() {
        return defaultCache.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultCache.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultCache.getStatus();
    }
};