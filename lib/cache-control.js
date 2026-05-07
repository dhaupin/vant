/**
 * Vant CacheControl Class
 * Cache headers
 */

class CacheControl {
    constructor(options = {}) {
        this.options = {
            maxAge: options.maxAge || 3600,
            sMaxAge: options.sMaxAge || 86400,
            ...options
        };
        this._startTime = Date.now();
    }
    
    /**
     * Set public cache
     */
    public(maxAge) {
        const age = maxAge || this.options.maxAge;
        return `public, max-age=${age}`;
    }
    
    /**
     * Set private cache
     */
    private(maxAge) {
        const age = maxAge || this.options.maxAge;
        return `private, max-age=${age}, no-store`;
    }
    
    /**
     * No cache
     */
    noCache() {
        return 'no-cache, no-store, must-revalidate';
    }
    
    /**
     * Apply to response
     */
    apply(ctx, type = 'public', maxAge) {
        const value = type === 'no-cache' ? this.noCache() : 
                     type === 'private' ? this.private(maxAge) : 
                     this.public(maxAge);
        
        ctx.response.header('Cache-Control', value);
        return ctx;
    }
    
    getLayerStatus() {
        return { name: 'CacheControl', type: 'http', enabled: true, config: { maxAge: this.options.maxAge }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'CacheControl' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    CacheControl, create: (o) => new CacheControl(o),
    public: (a) => new CacheControl().public(a),
    private: (a) => new CacheControl().private(a),
    noCache: () => new CacheControl().noCache(),
    apply: (c, t, a) => new CacheControl().apply(c, t, a),
    getLayerStatus: () => ({ name: 'CacheControl', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'CacheControl' }),
    getStatus: () => ({ enabled: true })
};