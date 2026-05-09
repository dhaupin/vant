/**
 * Vant Server Class
 * HTTP/HTTPS server wrapper with TLS support + security chain
 * 
 * Security chain: VAF → QoS Rate-Limit → Auth → Escrow → Handler
 * 
 * Usage:
 *   const { Server } = require('./server');
 *   const server = new Server({ port: 3456 });
 *   await server.listen();
 * 
 * TLS:
 *   const server = new Server({
 *     port: 3456,
 *     cert: '/path/to/cert.pem',
 *     key: '/path/to/key.pem'
 *   });
 * 
 * Environment:
 *   VANT_SERVER_PORT    - Server port (default: 3456)
 *   VANT_SERVER_BIND   - Bind address (default: 127.0.0.1)
 *   VANT_SERVER_CERT   - TLS certificate path
 *   VANT_SERVER_KEY   - TLS key path
 *   VANT_SERVER_INSECURE - Allow HTTP (default: false)
 *   VANT_SERVER_AUTH_REQUIRED - Require auth (default: false)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const Encrypt = require('./encrypt');
const { env } = require('./env');
const vaf = require('./vaf');
const { QoS } = require('./qos');
const { Escrow } = require('./escrow');
const { Auth } = require('./auth');

class Server {
    constructor(options = {}) {
        // Port + bind from options or env
        this.options = {
            port: options.port || env.serverPort() || 3456,
            host: options.host || env.serverBind() || '127.0.0.1',
            // TLS options
            cert: options.cert || env.serverCert() || null,
            key: options.key || env.serverKey() || null,
            // Allow HTTP fallback for development
            allowInsecure: options.allowInsecure || process.env.VANT_SERVER_INSECURE === '1',
            // Security options
            authRequired: options.authRequired || process.env.VANT_SERVER_AUTH_REQUIRED === '1',
            // Escrow per-request cost limit
            maxRequestCost: options.maxRequestCost || 100,
            // Request limits (security)
            requestLimit: options.requestLimit || 1024 * 1024,  // 1MB body limit
            requestTimeout: options.requestTimeout || 30000,  // 30s timeout
        };
        this._server = null;
        this._router = null;
        this._startTime = null;
        
        // Initialize security chain (QoS includes rate-limit + circuit-breaker + bulkhead)
        this._qos = new QoS();
        this._auth = new Auth();
        this._escrow = new Escrow({ maxCost: this.options.maxRequestCost });
        this._events = {};
        
        // Security headers
        this._securityHeaders = {
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        };
    }
    
    /**
     * Listen for events
     */
    on(event, fn) {
        this._events[event] = this._events[event] || [];
        this._events[event].push(fn);
    }
    
    /**
     * Emit event
     */
    _emit(event, data) {
        const handlers = this._events[event] || [];
        handlers.forEach(fn => fn(data));
    }
    
    /**
     * Set router
     */
    use(router) {
        this._router = router;
        return this;
    }
    
    /**
     * Get server address
     */
    address() {
        if (!this._server) return null;
        const addr = this._server.address();
        return { host: addr.address, port: addr.port };
    }
    
    /**
     * Check if TLS certificates are available
     */
    hasTls() {
        const { cert, key } = this.options;
        return cert && key && fs.existsSync(cert) && fs.existsSync(key);
    }
    
    /**
     * Get server info
     */
    getInfo() {
        return {
            port: this.options.port,
            host: this.options.host,
            tls: this.hasTls(),
            running: !!this._server,
            uptime: this._startTime ? Date.now() - this._startTime : 0
        };
    }
    
    /**
     * Start server with TLS or HTTP fallback
     */
    listen(port, host) {
        const p = port || this.options.port;
        const h = host || this.options.host;
        
        // Determine protocol
        const useHttps = this.hasTls();
        const protocol = useHttps ? 'https' : 'http';
        
        // Create server
        let server;
        if (useHttps) {
            const cert = fs.readFileSync(this.options.cert);
            const key = fs.readFileSync(this.options.key);
            server = https.createServer({ cert, key }, this._handleRequest.bind(this));
        } else if (this.options.allowInsecure) {
            server = http.createServer(this._handleRequest.bind(this));
        } else {
            // Refuse to start HTTP in production
            throw new Error(
                'TLS not configured. Either set VANT_SERVER_CERT/VANT_SERVER_KEY or ' +
                'use VANT_SERVER_INSECURE=1 for development only.'
            );
        }
        
        this._server = server;
        
        return new Promise((resolve) => {
            this._server.listen(p, h, () => {
                this._startTime = Date.now();
                const addr = { host: h, port: p };
                console.log(`[Server] ${protocol.toUpperCase()} listening on ${h}:${p}`);
                if (!useHttps) {
                    console.log('[Warning] HTTP only. Use TLS certificates for production.');
                }
                this._emit('listening', addr);
                resolve(this);
            });
        });
    }
    
    /**
     * Handle request with security chain
     * Chain: VAF → Rate-Limit → Auth → Escrow → Handler
     */
    async _handleRequest(req, res) {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        // Get client IP for rate limiting
        const clientIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
        
        // Collect body
        let body = '';
        let bodySize = 0;
        const requestLimit = this.options.requestLimit;
        const requestTimeout = this.options.requestTimeout;
        
        // Set request timeout
        const requestId = Encrypt.generateId();
        req.setTimeout(requestTimeout, function() {
            res.writeHead(408, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request timeout', requestId: requestId }));
            req.destroy();
        });
        
        // Security headers + rate limit headers
        res.setHeader('X-Request-Id', requestId);
        var rateStatus = this._qos.getRateLimiterStatus();
        res.setHeader('X-RateLimit-Limit', String(rateStatus.config.maxPerMinute));
        // Note: client count tracking would need more complexity
        res.setHeader('X-RateLimit-Remaining', '0');
        
        req.on('data', function(chunk) {
            bodySize += chunk.length;
            if (bodySize > requestLimit) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request body too large' }));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', async () => {
            try {
                let result;
                const url = req.url.split('?')[0];
                
                // === SECURITY CHAIN ===
                
                // 1. VAF: Input validation
                vaf.check(url);  // throws on bad input
                if (body) vaf.check(body);  // validate body too
                
                // 2. QoS: Rate limiting + concurrency
                await this._qos.check(clientIp, 'read');
                
                // 3. Auth: API key validation (if required)
                const apiKey = req.headers['x-api-key'];
                if (this.options.authRequired) {
                    if (!apiKey || !this._auth.validateApiKey(apiKey)) {
                        throw new Error('Unauthorized - valid API key required');
                    }
                }
                
                // 4. Escrow: Budget check for write operations
                const isWrite = req.method === 'POST' && url === '/call';
                if (isWrite) {
                    const allowed = this._escrow.canSpend('request', 10);
                    if (!allowed) {
                        throw new Error('Budget exceeded');
                    }
                }
                
                // === HANDLE REQUEST ===
                
                // Route: /tools, /health, /call
                if (url === '/tools' && req.method === 'GET') {
                    result = this._router ? await this._router.handle('tools/list', {}) : { tools: [] };
                } else if (url === '/health' && req.method === 'GET') {
                    result = { status: 'ok', uptime: this._startTime ? Date.now() - this._startTime : 0 };
                } else if (url === '/call' && req.method === 'POST') {
                    const request = body ? JSON.parse(body) : {};
                    result = this._router ? await this._router.handle(request.method, request.params) : { error: 'No handler' };
                } else if (this._router) {
                    const route = this._router.match(req.method, url);
                    if (route) {
                        result = await route.handler(req, res);
                    } else {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not Found' }));
                        return;
                    }
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ vant: 'running' }));
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(e.message.includes('Unauthorized') ? 401 : 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }
    
    /**
     * Stop server
     */
    stop() {
        return new Promise((resolve) => {
            if (this._server) {
                this._server.close(() => {
                    console.log('[Server] Stopped');
                    resolve(this);
                });
            } else {
                resolve(this);
            }
        });
    }
    
    getLayerStatus() {
        return { name: 'Server', type: 'http', enabled: true, config: { port: this.options.port }, state: { running: !!this._server, uptime: this._startTime ? Date.now() - this._startTime : 0 } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Server' };
    }
    
    getStatus() {
        return { enabled: true, running: !!this._server };
    }
}

module.exports = {
    Server, create: (o) => new Server(o),
    use: (r) => new Server().use(r),
    listen: (p, h) => new Server().listen(p, h),
    stop: () => new Server().stop(),
    getLayerStatus: () => ({ name: 'Server', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Server' }),
    getStatus: () => ({ enabled: true })
};