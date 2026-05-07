/**
 * Vant RateLimiter Class  
 * HTTP-specific rate limiting
 */

class RateLimiter {
    constructor(options = {}) {
        this.options = { 
            windowMs: options.windowMs || 60000,
            maxRequests: options.maxRequests || 100,
            ...options 
        };
        this._requests = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Check if allowed
     */
    check(key) {
        const now = Date.now();
        const windowStart = now - this.options.windowMs;
        
        const requests = (this._requests.get(key) || []).filter(t => t > windowStart);
        const remaining = this.options.maxRequests - requests.length;
        
        if (remaining <= 0) {
            return { allowed: false, remaining: 0, reset: requests[0] || now + this.options.windowMs };
        }
        
        requests.push(now);
        this._requests.set(key, requests);
        
        return { allowed: true, remaining: remaining - 1, reset: now + this.options.windowMs };
    }
    
    /**
     * Middleware check
     */
    middleware(key) {
        return (ctx) => {
            const ip = ctx.request.get('x-forwarded-for') || 'unknown';
            const result = this.check(key || ip);
            
            ctx.response.header('X-RateLimit-Limit', this.options.maxRequests);
            ctx.response.header('X-RateLimit-Remaining', result.remaining);
            ctx.response.header('X-RateLimit-Reset', Math.floor(result.reset / 1000));
            
            return result;
        };
    }
    
    /**
     * Reset key
     */
    reset(key) {
        this._requests.delete(key);
    }
    
    getLayerStatus() { return { name: 'RateLimiter', type: 'security', enabled: true, config: { windowMs: this.options.windowMs, maxRequests: this.options.maxRequests }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'RateLimiter' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    RateLimiter, create: (o) => new RateLimiter(o),
    check: (k) => new RateLimiter().check(k),
    middleware: (k) => new RateLimiter().middleware(k),
    getLayerStatus: () => ({ name: 'RateLimiter', type: 'security', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'RateLimiter' }),
    getStatus: () => ({ enabled: true })
};