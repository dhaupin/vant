/**
 * Vant IPFilter Class
 * IP allow/deny list
 */

class IPFilter {
    constructor(options = {}) {
        this.options = { mode: options.mode || 'allow' };
        this._allowed = new Set();
        this._denied = new Set();
        this._startTime = Date.now();
    }
    
    /**
     * Add allowed IP
     */
    allow(ip) {
        this._allowed.add(ip);
        return this;
    }
    
    /**
     * Add denied IP
     */
    deny(ip) {
        this._denied.add(ip);
        return this;
    }
    
    /**
     * Check IP
     */
    check(ip) {
        if (this._denied.has(ip)) {
            return { allowed: false, reason: 'denied' };
        }
        
        if (this._allowed.size > 0) {
            return { allowed: this._allowed.has(ip), reason: this._allowed.has(ip) ? 'allowed' : 'not in allow list' };
        }
        
        return { allowed: this.options.mode === 'allow', reason: this.options.mode };
    }
    
    /**
     * Middleware check
     */
    middleware(ctx) {
        const ip = ctx.request.get('x-forwarded-for') || 
                   ctx.request.get('x-real-ip') || 
                   'unknown';
        
        const result = this.check(ip);
        
        if (!result.allowed) {
            ctx.response.status(403).json({ error: 'Forbidden', reason: result.reason });
        }
        
        return result;
    }
    
    getLayerStatus() { return { name: 'IPFilter', type: 'security', enabled: true, config: { mode: this.options.mode, allowed: this._allowed.size, denied: this._denied.size }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'IPFilter' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    IPFilter, create: (o) => new IPFilter(o),
    allow: (ip) => new IPFilter().allow(ip),
    deny: (ip) => new IPFilter().deny(ip),
    check: (ip) => new IPFilter().check(ip),
    getLayerStatus: () => ({ name: 'IPFilter', type: 'security', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'IPFilter' }),
    getStatus: () => ({ enabled: true })
};