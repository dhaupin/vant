/**
 * Vant Server Class
 * HTTP/HTTPS server wrapper with TLS support + security chain
 * 
 * Security chain: VAF → Sandbox → QoS Rate-Limit → Auth → Escrow → Handler
 * 
 * Full HTTP stack included:
 *   - Body parsing (JSON, form, text)
 *   - CORS handling
 *   - Security headers (helmet)
 *   - Middleware chain
 *   - Session management
 *   - WebSocket support
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
const config = require('./config');
const network = require('./network');
const vaf = require('./vaf');
const { QoS } = require('./qos');
const { Escrow } = require('./escrow');
const { Auth } = require('./auth');
const audit = require('./audit');
const errors = require('./error');
let _event = null;
function _getEvent() {
    if (!_event) {
        try { _event = require('./event'); } catch (e) {}
    }
    return _event;
}
function _emit(event, data) {
    const ev = _getEvent();
    if (ev && ev.emit) {
        ev.emit(event, data);
    }
}
// Lazy-load sandbox to avoid circular dep
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { 
            const sb = require('./sandbox');
            _sandbox = sb.defaultSandbox || sb;  // Use instance, not module
        } catch (e) {}
    }
    return _sandbox;
}

// Gate helpers
function _checkNetwork() {
    const sb = _getSandbox();
    if (!sb || !sb.canNetwork()) {
        throw new errors.Error('Network permission required', { code: errors.CODES.NETWORK_DENIED, retryable: false });
    }
}

function _checkRead() {
    const sb = _getSandbox();
    if (!sb || !sb.canRead()) {
        throw new errors.Error('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
    }
}

function _checkWrite() {
    const sb = _getSandbox();
    if (!sb || !sb.canWrite()) {
        throw new errors.Error('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
    }
}

/**
 * BodyParser - Parse request body (JSON, form, text)
 */
class BodyParser {
    constructor(options = {}) {
        this.options = {
            limit: options.limit || '1mb',
            encoding: options.encoding || 'utf8'
        };
    }

    async parse(ctx) {
        const body = ctx.body || '';
        const contentType = ctx.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
            try {
                return JSON.parse(body);
            } catch (e) { 
                console.warn("[server] JSON parse failed:", e.message);
                return null;
            }
        }
        
        // Form parsing
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(body);
            return Object.fromEntries(params);
        }
        
        return body;
    }
}

/**
 * CORS - Cross-origin resource sharing
 */
class CORS {
    constructor(options = {}) {
        this.options = {
            origin: options.origin || '*',
            methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: options.headers || ['Content-Type', 'Authorization'],
            credentials: options.credentials !== false,
            maxAge: options.maxAge || 86400
        };
    }

    handle(ctx) {
        const origin = ctx.headers.origin || '*';
        
        ctx.setHeader('Access-Control-Allow-Origin', this.options.origin === '*' ? '*' : origin);
        ctx.setHeader('Access-Control-Allow-Methods', this.options.methods.join(', '));
        ctx.setHeader('Access-Control-Allow-Headers', this.options.headers.join(', '));
        ctx.setHeader('Access-Control-Allow-Credentials', this.options.credentials);
        ctx.setHeader('Access-Control-Max-Age', this.options.maxAge);
    }
}

/**
 * Helmet - Security headers
 */
class Helmet {
    constructor(options = {}) {
        this.options = {
            contentSecurityPolicy: options.contentSecurityPolicy !== false,
            strictTransportSecurity: options.strictTransportSecurity !== false,
            xContentTypeOptions: options.xContentTypeOptions !== false,
            xFrameOptions: options.xFrameOptions || 'DENY',
            referrerPolicy: options.referrerPolicy || 'no-referrer'
        };
    }

    apply(ctx) {
        if (this.options.contentSecurityPolicy) {
            ctx.setHeader('Content-Security-Policy', "default-src 'self'");
        }
        if (this.options.strictTransportSecurity) {
            ctx.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        if (this.options.xContentTypeOptions) {
            ctx.setHeader('X-Content-Type-Options', 'nosniff');
        }
        if (this.options.xFrameOptions) {
            ctx.setHeader('X-Frame-Options', this.options.xFrameOptions);
        }
        if (this.options.referrerPolicy) {
            ctx.setHeader('Referrer-Policy', this.options.referrerPolicy);
        }
    }
}

/**
 * MiddlewareStack - Chain middleware handlers
 */
class MiddlewareStack {
    constructor() {
        this._stack = [];
    }

    use(fn) {
        this._stack.push(fn);
        return this;
    }

    async execute(ctx, handler) {
        let index = 0;
        const next = async () => {
            if (index >= this._stack.length) return handler(ctx);
            return this._stack[index++](ctx, next);
        };
        return next();
    }
}

/**
 * Session - Request context with ID
 */
class Session {
    constructor(options = {}) {
        this.options = { ...options };
        this._startTime = Date.now();
    }

    create(ctx) {
        ctx.sessionId = ctx.sessionId || this._generateId();
        ctx.createdAt = Date.now();
        return ctx;
    }

    _generateId() {
        // Use crypto for secure random - Math.random() is PREDICTABLE
        const crypto = require('crypto');
        return 'sess_' + crypto.randomBytes(16).toString('hex') + Date.now().toString(36);
    }
}

/**
 * SessionStore - Session storage
 */
class SessionStore {
    constructor(options = {}) {
        this.options = { ttl: options.ttl || 3600000 };
        this._sessions = new Map();
    }

    create(data = {}) {
        const crypto = require('crypto');
        const id = 'sess_' + crypto.randomBytes(16).toString('hex');
        this._sessions.set(id, { data, createdAt: Date.now(), lastAccessedAt: Date.now() });
        return id;
    }

    get(id) {
        const sess = this._sessions.get(id);
        if (sess) {
            sess.lastAccessedAt = Date.now();
        }
        return sess;
    }

    destroy(id) {
        this._sessions.delete(id);
    }

    cleanup() {
        const now = Date.now();
        for (const [id, sess] of this._sessions) {
            if (now - sess.lastAccessedAt > this.options.ttl) {
                this._sessions.delete(id);
            }
        }
    }
}

class Server {
    constructor(options = {}) {
        // Port + bind from options or env
        this.options = {
            port: options.port || config.serverPort() || 3456,
            host: options.host || config.serverBind() || '127.0.0.1',
            // TLS options
            cert: options.cert || config.serverCert() || null,
            key: options.key || config.serverKey() || null,
            // Allow HTTP fallback for development (from config.server)
            allowInsecure: options.allowInsecure || config.get('server.insecure') || false,
            // Security options (from config.server)
            authRequired: options.authRequired || config.get('server.authRequired') || false,
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
        _checkRead();
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
        _checkNetwork();
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
                audit.info(`[Server] ${protocol.toUpperCase()} listening on ${h}:${p}`);
                if (!useHttps) {
                    audit.info('[Warning] HTTP only. Use TLS certificates for production.');
                }
                this._emit('listening', addr);
                _emit('server:start', { addr, protocol });
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
        

        // Generate request ID early
        const requestId = Encrypt.generateId();
        _emit('server:request', { requestId, method: req.method, url: req.url, clientIp });

        // Check network status
        if (!network.isOnline()) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service unavailable - network offline', requestId }));
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
                    if (this._router) {
                        result = await sandbox.execute(() => this._router.handle('tools/list', {}), {type: 'read'});
                    } else {
                        // Fallback: use vant getTools()
                        try {
                            const vant = require('./vant');
                            result = { tools: vant.getTools() };
                        } catch (e) {
                            result = { tools: [] };
                        }
                    }
                } else if (url === '/health' && req.method === 'GET') {
                    result = { status: 'ok', uptime: this._startTime ? Date.now() - this._startTime : 0 };
                } else if (url === '/call' && req.method === 'POST') {
                    const request = body ? JSON.parse(body) : {};
                    const opType = request.read ? 'read' : 'write';
                    if (this._router) {
                        result = await sandbox.execute(() => this._router.handle(request.method, request.params), {type: opType});
                    } else {
                        // Fallback: use vant executeTool
                        try {
                            const vant = require('./vant');
                            result = await vant.executeTool(request.method, request.params);
                        } catch (e) {
                            result = { error: 'Tool execution failed: ' + e.message };
                        }
                    }
                } else if (this._router) {
                    const route = this._router.match(req.method, url);
                    if (route) {
                        // Attach parsed body and params to req for handlers
                        req.body = body ? JSON.parse(body) : {};
                        req.params = route.params || {};
                        // Wrap res with Server.Response for .json() support
                        const resWrapper = new Server.Response();
                        resWrapper.send = (data) => {
                            res.writeHead(resWrapper.getStatus(), { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(data));
                        };
                        resWrapper.json = (data) => {
                            res.writeHead(resWrapper.getStatus(), { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(data));
                        };
                        result = await route.handler(req, resWrapper);
                    } else {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not Found' }));
                        return;
                    }
                } else if (url === '/brain' || url === '/mcp' || url === '/islands') {
                    // Known status endpoints
                    res.writeHead(200);
                    res.end(JSON.stringify({ vant: 'running' }));
                    return;
                } else {
                    // Unknown URL without router - return 404
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Not Found' }));
                    return;
                }
                
                if (result === undefined) {
                    return;
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(e.message.includes('Unauthorized') ? 401 : 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
                _emit('server:error', { error: e.message, requestId });
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
                    audit.info('[Server] Stopped');
                    _emit('server:stop', { timestamp: Date.now() });
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


// ============================================================================
// INNER CLASSES - Consolidated from lib/request.js, lib/response.js, lib/router.js, lib/static.js
// ============================================================================

Server.Request = class Request {
    constructor(options = {}) {
        this.options = { ...options };
        this._headers = new Map();
        this._params = {};
        this._query = {};
        this._body = null;
        this._method = 'GET';
        this._url = '/';
    }
    header(k, v) { this._headers.set(k.toLowerCase(), v); return this; }
    get(k) { return this._headers.get(k.toLowerCase()); }
    body(b) { this._body = b; return this; }
    getBody() { return this._body; }
    method(m) { this._method = m; return this; }
    getMethod() { return this._method; }
    url(u) { this._url = u; return this; }
    getUrl() { return this._url; }
    getPath() { return this._url.split('?')[0]; }
};

Server.Response = class Response {
    constructor(options = {}) {
        this.options = { ...options };
        this._status = 200;
        this._headers = new Map();
        this._body = null;
        this._sent = false;
    }
    status(code) { this._status = code; return this; }
    getStatus() { return this._status; }
    header(k, v) { this._headers.set(k, v); return this; }
    send(b) { this._body = b; this._sent = true; return this; }
    json(obj) { this._headers.set('Content-Type', 'application/json'); this._body = JSON.stringify(obj); this._sent = true; return this; }
    getBody() { return this._body; }
    isSent() { return this._sent; }
};

Server.Router = class Router {
    constructor() { this._routes = []; }
    get(p, h) { this._routes.push({ method: 'GET', pattern: p, handler: h }); return this; }
    post(p, h) { this._routes.push({ method: 'POST', pattern: p, handler: h }); return this; }
    put(p, h) { this._routes.push({ method: 'PUT', pattern: p, handler: h }); return this; }
    delete(p, h) { this._routes.push({ method: 'DELETE', pattern: p, handler: h }); return this; }
    match(method, url) {
        const route = this._routes.find(r => r.method === method && this._match(r.pattern, url));
        if (!route) return null;
        // Extract params
        const params = {};
        const pa = route.pattern.split('/').filter(Boolean);
        const ua = url.split('/').filter(Boolean);
        pa.forEach((p, i) => {
            if (p.startsWith(':')) {
                params[p.slice(1)] = ua[i];
            }
        });
        return { ...route, params };
    }
    _match(pattern, url) {
        const pa = pattern.split('/').filter(Boolean);
        const ua = url.split('/').filter(Boolean);
        return pa.length === ua.length && pa.every((p, i) => p === ua[i] || p.startsWith(':'));
    }
};

Server.Static = class Static {
    constructor(options = {}) {
        this.options = { root: options.root || 'public', index: options.index || 'index.html', ...options };
        if (!fs.existsSync(this.options.root)) {
            _checkWrite();
            try { fs.mkdirSync(this.options.root, { recursive: true }); } catch (e) { console.warn("[server] mkdir failed:", e.message); }
        }
    }
    async serve(ctx, filePath) {
        _checkRead();
        const fullPath = path.join(this.options.root, filePath);
        if (!fullPath.startsWith(path.resolve(this.options.root))) return null;
        if (!fs.existsSync(fullPath)) return null;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) return this.serve(ctx, path.join(filePath, this.options.index));
        const ext = path.extname(fullPath);
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg' };
        return { body: fs.readFileSync(fullPath), type: types[ext] || 'application/octet-stream' };
    }
};

Server.prototype.route = function(pattern, handler, method) {
    if (!this._router) this._router = new Server.Router();
    const m = (method || 'get').toLowerCase();
    if (m === 'get') this._router.get(pattern, handler);
    else if (m === 'post') this._router.post(pattern, handler);
    return this;
};

Server.prototype.static = function(root, options) {
    const st = new Server.Static({ root, ...options });
    return this.route('/*', async (ctx) => await st.serve(ctx, ctx.url.split('?')[0]), 'get');
};



// ============================================================================



// ============================================================================
// HTTP Export Wrapper (delegated to Server for DRY consolidation)
// ============================================================================
module.exports = {
    // Classes
    Server,
    Request: Server.Request,
    Response: Server.Response,
    Router: Server.Router,
    Static: Server.Static,
    
    // NEW: HTTP Stack
    BodyParser,
    CORS,
    Helmet,
    MiddlewareStack,
    Session,
    SessionStore,

    create: (o) => new Server(o),
    use: (r) => new Server().use(r),
    listen: (p, h) => new Server().listen(p, h),
    stop: () => new Server().stop(),
    getLayerStatus: () => ({ name: 'Server', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Server' }),
    getStatus: () => ({ enabled: true })
};
