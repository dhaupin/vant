/**
 * Vant RateLimit Class
 * 
 * Per-user rate limiting, wrapper for existing rate-limit.js
 * Sliding window implementation
 * 
 * Usage:
 *   const rateLimit = require('./rate-limit');
 *   
 *   // Check limit
 *   const allowed = await rateLimit.check('user123', 'write');
 *   
 *   // Record request
 *   await rateLimit.record('user123', 'write');
 *   
 *   // Check allowed
 *   rateLimit.isOperationAllowed('read');
 *   rateLimit.getLayerStatus();
 */

const existing = require('./rate-limit');

/**
 * RateLimit Class
 */
class RateLimit {
    constructor(options = {}) {
        this.options = {
            windowMs: options.windowMs || 60000,
            maxRequests: options.maxRequests || 100,
            ...options
        };
        
        this._requests = []; // { key, timestamp }
        this._startTime = Date.now();
    }
    
    /**
     * Clean old requests
     */
    _cleanup() {
        const cutoff = Date.now() - this.options.windowMs;
        this._requests = this._requests.filter(r => r.timestamp > cutoff);
    }
    
    /**
     * Get count for key
     */
    _count(key) {
        this._cleanup();
        return this._requests.filter(r => r.key === key).length;
    }
    
    /**
     * Check if allowed
     */
    async check(key, action = 'default') {
        const fullKey = `${action}:${key}`;
        const count = this._count(fullKey);
        
        return {
            allowed: count < this.options.maxRequests,
            remaining: Math.max(0, this.options.maxRequests - count),
            resetIn: this.options.windowMs
        };
    }
    
    /**
     * Record request
     */
    async record(key, action = 'default') {
        const fullKey = `${action}:${key}`;
        this._requests.push({ key: fullKey, timestamp: Date.now() });
        this._cleanup();
        
        return this._count(fullKey);
    }
    
    /**
     * Get remaining requests
     */
    remaining(key, action = 'default') {
        const fullKey = `${action}:${key}`;
        return Math.max(0, this.options.maxRequests - this._count(fullKey));
    }
    
    /**
     * Reset limit for key
     */
    reset(key, action = 'default') {
        const fullKey = `${action}:${key}`;
        this._requests = this._requests.filter(r => r.key !== fullKey);
    }
    
    /**
     * Reset all
     */
    resetAll() {
        this._requests = [];
    }
    
    /**
     * Get stats
     */
    getStats() {
        this._cleanup();
        return {
            totalRequests: this._requests.length,
            uniqueKeys: new Set(this._requests.map(r => r.key)).size,
            windowMs: this.options.windowMs,
            maxRequests: this.options.maxRequests
        };
    }
    
    getLayerStatus() {
        return {
            name: 'RateLimit',
            type: 'rate_limit',
            enabled: true,
            config: { windowMs: this.options.windowMs, maxRequests: this.options.maxRequests },
            state: { requests: this._requests.length, uptime: Date.now() - this._startTime }
        };
    }
    
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'RateLimit'};
    }
    
    getStatus() {
        return {enabled: true, requests: this._requests.length};
    }
}

const defaultRateLimit = new RateLimit();

module.exports = {
    RateLimit,
    create(options) {
        return new RateLimit(options);
    },
    check(key, action) {
        return defaultRateLimit.check(key, action);
    },
    record(key, action) {
        return defaultRateLimit.record(key, action);
    },
    remaining(key, action) {
        return defaultRateLimit.remaining(key, action);
    },
    reset(key, action) {
        return defaultRateLimit.reset(key, action);
    },
    resetAll() {
        return defaultRateLimit.resetAll();
    },
    getStats() {
        return defaultRateLimit.getStats();
    },
    getLayerStatus() {
        return defaultRateLimit.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        return defaultRateLimit.isOperationAllowed(operationType, context);
    },
    getStatus() {
        return defaultRateLimit.getStatus();
    }
};