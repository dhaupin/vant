/**
 * Vant CORS Class
 * Cross-origin resource sharing
 */

class CORS {
    constructor(options = {}) {
        this.options = {
            origin: options.origin || '*',
            methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: options.headers || ['Content-Type', 'Authorization'],
            credentials: options.credentials || true,
            maxAge: options.maxAge || 86400,
            ...options
        };
        this._startTime = Date.now();
    }
    
    /**
     * Handle CORS request
     */
    handle(ctx) {
        const origin = ctx.request.get('origin');
        
        // Check origin
        if (this.options.origin !== '*' && origin !== this.options.origin) {
            return ctx;
        }
        
        // Set headers
        ctx.response.header('Access-Control-Allow-Origin', this.options.origin);
        
        if (this.options.credentials) {
            ctx.response.header('Access-Control-Allow-Credentials', 'true');
        }
        
        ctx.response.header('Access-Control-Allow-Methods', this.options.methods.join(', '));
        ctx.response.header('Access-Control-Allow-Headers', this.options.headers.join(', '));
        ctx.response.header('Access-Control-Max-Age', this.options.maxAge);
        
        return ctx;
    }
    
    /**
     * Handle preflight
     */
    handlePreflight(ctx) {
        ctx.response.status(204);
        return this.handle(ctx);
    }
    
    getLayerStatus() {
        return { name: 'CORS', type: 'http', enabled: true, config: { origin: this.options.origin, methods: this.options.methods.length }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'CORS' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    CORS, create: (o) => new CORS(o),
    handle: (ctx) => new CORS().handle(ctx),
    handlePreflight: (ctx) => new CORS().handlePreflight(ctx),
    getLayerStatus: () => ({ name: 'CORS', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'CORS' }),
    getStatus: () => ({ enabled: true })
};