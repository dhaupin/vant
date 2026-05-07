/**
 * Vant Compression Class
 * Gzip compression middleware
 */

const zlib = require('zlib');

class Compression {
    constructor(options = {}) {
        this.options = {
            level: options.level || 6,
            threshold: options.threshold || 1024,
            ...options
        };
        this._startTime = Date.now();
    }
    
    /**
     * Compress data
     */
    compress(buffer) {
        return new Promise((resolve, reject) => {
            zlib.gzip(buffer, { level: this.options.level }, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }
    
    /**
     * Handle compression
     */
    async handle(ctx) {
        const acceptEncoding = ctx.request.get('accept-encoding') || '';
        
        if (!acceptEncoding.includes('gzip')) {
            return ctx;
        }
        
        const body = ctx.response._body;
        
        if (!body || body.length < this.options.threshold) {
            return ctx;
        }
        
        // Can't compress if already sent
        if (ctx.response._sent) {
            return ctx;
        }
        
        // Mark for compression
        ctx.response.header('Content-Encoding', 'gzip');
        
        return ctx;
    }
    
    getLayerStatus() {
        return { name: 'Compression', type: 'http', enabled: true, config: { level: this.options.level, threshold: this.options.threshold }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Compression' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    Compression, create: (o) => new Compression(o),
    compress: (b) => new Compression().compress(b),
    handle: (c) => new Compression().handle(c),
    getLayerStatus: () => ({ name: 'Compression', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Compression' }),
    getStatus: () => ({ enabled: true })
};