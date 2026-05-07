/**
 * Vant Static Class
 * Static file serving
 */

const fs = require('fs');
const path = require('path');

class Static {
    constructor(options = {}) {
        this.options = {
            root: options.root || 'public',
            index: options.index || 'index.html',
            maxAge: options.maxAge || 3600000,
            ...options
        };
        
        // Ensure root exists
        if (!fs.existsSync(this.options.root)) {
            try { fs.mkdirSync(this.options.root, { recursive: true }); } catch {}
        }
        
        this._startTime = Date.now();
    }
    
    /**
     * Serve file
     */
    async serve(ctx, filePath) {
        const fullPath = path.join(this.options.root, filePath);
        
        // Security: prevent directory traversal
        if (!fullPath.startsWith(path.resolve(this.options.root))) {
            return null;
        }
        
        // Check exists
        if (!fs.existsSync(fullPath)) {
            return null;
        }
        
        // Check if directory
        if (fs.statSync(fullPath).isDirectory()) {
            return this.serve(ctx, path.join(filePath, this.options.index));
        }
        
        // Read file
        const content = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath);
        const contentType = this._getContentType(ext);
        
        ctx.response.header('Content-Type', contentType);
        ctx.response.header('Content-Length', content.length);
        ctx.response.header('Cache-Control', `public, max-age=${Math.floor(this.options.maxAge / 1000)}`);
        
        return ctx.response.send(content);
    }
    
    /**
     * Get content type
     */
    _getContentType(ext) {
        const types = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain'
        };
        return types[ext] || 'application/octet-stream';
    }
    
    getLayerStatus() {
        return { name: 'Static', type: 'http', enabled: true, config: { root: this.options.root, maxAge: this.options.maxAge }, state: { uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Static' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    Static, create: (o) => new Static(o),
    serve: (c, p) => new Static().serve(c, p),
    getLayerStatus: () => ({ name: 'Static', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Static' }),
    getStatus: () => ({ enabled: true })
};