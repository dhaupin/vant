/**
 * Vant Helmet Class
 * Security headers middleware
 */

class Helmet {
    constructor(options = {}) {
        this.options = {
            contentSecurityPolicy: options.contentSecurityPolicy !== false,
            crossOriginEmbedderPolicy: options.crossOriginEmbedderPolicy || false,
            crossOriginOpenerPolicy: options.crossOriginOpenerPolicy || false,
            crossOriginResourcePolicy: options.crossOriginResourcePolicy || false,
            originAgentCluster: options.originAgentCluster !== false,
            referrerPolicy: options.referrerPolicy !== false,
            strictTransportSecurity: options.strictTransportSecurity !== false,
            xContentTypeOptions: options.xContentTypeOptions !== false,
            xDNSPrefetchControl: options.xDNSPrefetchControl !== false,
            xFrameOptions: options.xFrameOptions !== false,
            xPermittedCrossDomainPolicies: options.xPermittedCrossDomainPolicies !== false,
            ...options
        };
        this._startTime = Date.now();
    }
    
    /**
     * Apply security headers
     */
    handle(ctx) {
        const res = ctx.response;
        
        // Content-Security-Policy
        if (this.options.contentSecurityPolicy) {
            res.header('Content-Security-Policy', "default-src 'self'");
        }
        
        // X-Content-Type-Options
        if (this.options.xContentTypeOptions) {
            res.header('X-Content-Type-Options', 'nosniff');
        }
        
        // X-Frame-Options
        if (this.options.xFrameOptions) {
            res.header('X-Frame-Options', 'DENY');
        }
        
        // X-XSS-Protection (legacy but useful)
        res.header('X-XSS-Protection', '1; mode=block');
        
        // Strict-Transport-Security
        if (this.options.strictTransportSecurity) {
            res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        
        // Referrer-Policy
        if (this.options.referrerPolicy) {
            res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        }
        
        // Permissions-Policy
        res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        
        return ctx;
    }
    
    getLayerStatus() {
        return { name: 'Helmet', type: 'security', enabled: true, config: { headers: 8 }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Helmet' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    Helmet, create: (o) => new Helmet(o),
    handle: (c) => new Helmet().handle(c),
    getLayerStatus: () => ({ name: 'Helmet', type: 'security', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Helmet' }),
    getStatus: () => ({ enabled: true })
};