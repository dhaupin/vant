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
// (pass 127) The old _checkNetwork() gate on listen() made `vant server`
// refuse to bind on EVERY default install (sandbox network cap is deny by
// default) while lib/mcp.js bound freely - inconsistent, and it violated
// the PRD's own capability semantics: labs/prd-security.md scopes
// canNetwork to OUTBOUND HTTP/git. Binding a local listener is not
// outbound access. Inbound surface security stays: TLS enforcement,
// --auth/mcp.requireKey, rate limiting, escrow cost caps, body limits.
function _checkRead() {
    const sb = _getSandbox();
    if (!sb || !sb.canRead()) {
        throw new errors.VantError('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
    }
}

function _checkWrite() {
    const sb = _getSandbox();
    if (!sb || !sb.canWrite()) {
        throw new errors.VantError('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
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
 */class CORS {
        constructor(options = {}) {
            this.options = {
                origin: options.origin || '*',   // '*' or string/array allowlist
                methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                headers: options.headers || ['Content-Type', 'Authorization'],
                // (pass 251, issue #203) credentials default FALSE. The old
                // default (any non-false => true) paired with origin-reflection
                // meant "lock the door down" was actually "any Origin reads
                // credentialed responses". Opt-in only, and never emitted
                // together with the '*' wildcard (browsers reject the combo —
                // we refuse to pretend it means something).
                credentials: options.credentials === true,
                maxAge: options.maxAge || 86400
            };
        }

        // Origin comparisons: scheme/host are case-insensitive, trailing
        // slashes are noise. Fail-closed normalization.
        static _normalizeOrigin(o) {
            return String(o || '').trim().replace(/\/+$/, '').toLowerCase();
        }

        handle(ctx) {
            const reqOrigin = ctx.headers.origin || '';
            let allow;
            if (this.options.origin === '*' && !this.options.credentials) {
                allow = '*';   // honest wildcard: no credentials attached
            } else if (this.options.origin === '*') {
                allow = null;  // '*' + credentials is not a real posture
            } else {
                // (pass 251, issue #203) STRICT allowlist match — the caller's
                // Origin is echoed only when it EXACTLY equals one configured
                // entry. Reflection of arbitrary origins was the PoC hole:
                // ACAO:<attacker> + Allow-Credentials:true.
                const list = Array.isArray(this.options.origin) ? this.options.origin : [this.options.origin];
                const matched = list.some((entry) => CORS._normalizeOrigin(entry) === CORS._normalizeOrigin(reqOrigin));
                allow = matched ? reqOrigin : null;   // fail-closed: no ACAO at all
            }
            if (allow) {
                ctx.setHeader('Access-Control-Allow-Origin', allow);
                ctx.setHeader('Access-Control-Allow-Methods', this.options.methods.join(', '));
                ctx.setHeader('Access-Control-Allow-Headers', this.options.headers.join(', '));
                ctx.setHeader('Access-Control-Max-Age', this.options.maxAge);
                if (this.options.credentials) ctx.setHeader('Access-Control-Allow-Credentials', 'true');
            }
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
        // (pass 127) Bind is no longer gated on sandbox canNetwork - that
        // cap governs OUTBOUND traffic (PRD), and gating the bind made the
        // REST server unstartable on default installs (MCP never had the
        // gate). Security happens per-REQUEST below.
        _checkRead();
        const p = port || this.options.port;
        const h = host || this.options.host;

        // Determine protocol
        const useHttps = this.hasTls();
        const protocol = useHttps ? 'https' : 'http';

        // (pass 127) One coherent TLS rule, here where port+host are fully
        // resolved. Plaintext HTTP on a LOOPBACK bind is safe and is the
        // default posture (MCP parity - lib/mcp.js always allowed it).
        // Widening the bind without TLS is refused: that is how plaintext
        // leaks onto a network. Operators opt in explicitly via --insecure /
        // VANT_SERVER_INSECURE=1 (allowInsecure) if they really want it.
        // The old rule (TLS always required) made `vant server` refuse to
        // start on every default install.
        const isLoopback = (h === '127.0.0.1' || h === 'localhost' || h === '::1');

        // Create server
        let server;
        if (useHttps) {
            const cert = fs.readFileSync(this.options.cert);
            const key = fs.readFileSync(this.options.key);
            server = https.createServer({ cert, key }, this._handleRequest.bind(this));
        } else if (isLoopback || this.options.allowInsecure) {
            server = http.createServer(this._handleRequest.bind(this));
            if (!isLoopback) {
                audit.info('[Server] WARNING: plaintext HTTP bound to non-loopback address ' + h + '. Set VANT_SERVER_CERT/VANT_SERVER_KEY for TLS.');
            }
        } else {
            // Non-loopback bind, no TLS, no explicit opt-in
            throw new errors.VantError('TLS not configured: plaintext HTTP is only allowed on a loopback bind (127.0.0.1). Provide --cert/--key (or VANT_SERVER_CERT/VANT_SERVER_KEY), or pass --insecure to accept the risk explicitly.', { code: errors.CODES.CONFIG_MISSING });
        }

        this._server = server;

        // (r/2, prd-relay.md §2 - pass 236) THE RELAY MOVED OUT of this
        // server: the owner ruled the lib/relay module was a rogue parallel
        // system; the relay face now composes the WEBHOOK transport
        // (HMAC-gated POST /relay via lib/webhooks.js) + the api face
        // (lib/api.js relay). Mounted from the boot (vant.startFull), not
        // here — the REST listener serves exactly what it served before.

        return new Promise((resolve) => {
            this._server.listen(p, h, () => {
                this._startTime = Date.now();
                const addr = { host: h, port: p };
                audit.info(`[Server] ${protocol.toUpperCase()} listening on ${h}:${p}`);
                // (Battery item 4, #189 door sweep) The server prints its auth
                // posture truthfully on startup — the same line every key door
                // prints, derived from the R1 resolver itself.
                try { audit.info(config.authPosture().line); } catch (e) { /* posture never blocks listen */ }
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
        // (live-walk fix) THE DEAD-PEER SHIELD. Probing the door with a 64MB
        // body and hanging up as the 413 came back killed the process with
        // '[FATAL] Uncaught Exception: write ECONNRESET' — every answer path
        // below is a bare res.end, and NOTHING listened on the failed
        // socket, so the peer's mid-write death escaped as a process-level
        // uncaughtException. Shield request, response, and socket once, at
        // the door's mouth — this covers every res.end in this file (413,
        // 408, 400, 410, 404, 2xx and the router wrappers) without touching
        // any refusal. A dead peer becomes a silent cleanup instead of a
        // door-wide crash.
        const _shieldError = () => { /* dead peer: the answer just goes nowhere */ };
        if (req.socket && typeof req.socket.on === 'function') req.socket.on('error', _shieldError);
        if (typeof req.on === 'function') req.on('error', _shieldError);
        if (typeof res.on === 'function' && typeof res.listenerCount === 'function' && res.listenerCount('error') === 0) res.on('error', _shieldError);

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
        // pass 78: clientIp was computed BELOW this emit - every request
        // threw ReferenceError (TDZ: cannot access before initialization)
        // before routing. Live-repro'd; moved the computation up.
        const clientIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
        _emit('server:request', { requestId, method: req.method, url: req.url, clientIp });

        // Check network status
        if (!network.isOnline()) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service unavailable - network offline', requestId }));
            return;
        }

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
                // (pass 128) validateApiKey() returns a RESULT OBJECT
                // ({valid, reason}) - the old `!validateApiKey(apiKey)`
                // check was always truthy-object-true, so any PRESENT key
                // (even a wrong one) passed. Missing key was caught by the
                // !apiKey half; wrong keys sailed through with 200.
                const apiKey = req.headers['x-api-key'];
                if (this.options.authRequired) {
                    if (!apiKey || !this._auth.validateApiKey(apiKey).valid) {
                        throw new errors.VantError('Unauthorized - valid API key required', { code: errors.CODES.VAF_REQUIRED_FIELD });
                    }
                }

                // 4. Escrow: Budget check for write operations
                const isWrite = req.method === 'POST' && url === '/call';
                if (isWrite) {
                    const allowed = this._escrow.canSpend('request', 10);
                    if (!allowed) {
                        throw new errors.VantError('Budget exceeded', { code: errors.CODES.ESCROW_DENIED });
                    }
                }

                // === HANDLE REQUEST ===

                // Route: /tools, /health, /call
                if (url === '/tools' && req.method === 'GET') {
                    // (#187 retire) This REST /tools duplicated the MCP
                    // doors' tools/list - exactly the dashboard-owned
                    // parallel surface the audit retired. Gone with an
                    // honest pointer; the MCP door on 3457 keeps its /tools
                    // alias and is the tool surface (the prime directive).
                    res.writeHead(410, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Retired: GET /tools on the REST sidecar is gone (issue #187 - no dashboard-owned parallel surface).',
                        use: 'The MCP door IS the API: GET <mcp-port>/tools lists the exact same surface; POST /call still executes tools here.'
                    }));
                    return;
                } else if (url === '/health' && req.method === 'GET') {
                    result = { status: 'ok', uptime: this._startTime ? Date.now() - this._startTime : 0 };
                } else if (url === '/call' && req.method === 'POST') {
                    const request = body ? JSON.parse(body) : {};
                    // (pass 131) Honor the JSON-RPC 2.0 shape that
                    // docs/reference/rest-api.md has always documented for
                    // this endpoint ({jsonrpc, method:'tools/call',
                    // params:{name, arguments}, id}). The old handler read
                    // request.method as the TOOL NAME, so the documented
                    // example got {"error":"Unknown tool: tools/call"}.
                    // Flat shapes stay supported for existing callers:
                    // {method:'<tool>'} and {tool:'<tool>', args|params}.
                    const isRpc = request.jsonrpc === '2.0' || request.method === 'tools/call';
                    const rpcId = request.id !== undefined ? request.id : null;
                    // (crashtest #215) THE HOSTILE-JSON-RPC FAMILY answers
                    // typed 400, at the parse seam — never a silent drop
                    // (the old `result === undefined → return` below left
                    // these callers with NO response at all and never a
                    // 500: a malformed call is the CALLER's fault).
                    //   id present but not string/null/signed-int32 -> 400
                    //   params.name missing/not a string           -> 400
                    if (isRpc) {
                        if (rpcId !== null && typeof rpcId !== 'string'
                            && !(typeof rpcId === 'number' && Number.isSafeInteger(rpcId) && Math.abs(rpcId) <= 2147483647)) {
                            throw new errors.VantError('JSON-RPC id must be a string or a signed int32 number (got: ' + typeof rpcId + ')', { code: errors.CODES.VAF_TYPE_INVALID });
                        }
                        const rpcParams = request.params;
                        if (!rpcParams || typeof rpcParams !== 'object' || Array.isArray(rpcParams)
                            || typeof rpcParams.name !== 'string' || rpcParams.name.trim() === '') {
                            throw new errors.VantError("JSON-RPC 'tools/call' requires a string params.name (the tool to run)", { code: errors.CODES.VAF_REQUIRED_FIELD });
                        }
                    } else if (request.tool === undefined && request.method === undefined) {
                        throw new errors.VantError("POST /call requires a tool name ({tool:'…'|method:'…'})", { code: errors.CODES.VAF_REQUIRED_FIELD });
                    }
                    let toolName = request.method;
                    let toolArgs = request.params;
                    if (isRpc) {
                        toolName = request.params.name;
                        toolArgs = request.params.arguments;
                    } else if (request.tool !== undefined) {
                        toolName = request.tool;
                        toolArgs = request.args !== undefined ? request.args : request.params;
                    }
                    const rpcWrap = (r) => isRpc
                        ? { jsonrpc: '2.0', id: rpcId, ...(r && r.error ? { error: r.error } : { result: r }) }
                        : r;
                    const opType = request.read ? 'read' : 'write';
                    if (this._router) {
                        result = rpcWrap(await sandbox.execute(() => this._router.handle(toolName, toolArgs), {type: opType}));
                    } else {
                        // Fallback: use vant executeTool
                        try {
                            const vant = require('./vant');
                            result = rpcWrap(await vant.executeTool(toolName, toolArgs));
                        } catch (e) {
                            result = rpcWrap({ error: 'Tool execution failed: ' + e.message });
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
                } else if (url === '/brain') {
                    // (#187 retire) The pre-brain-registry /brain stub is
                    // gone with an honest pointer; brain verbs live on the
                    // MCP surface (brain_read/brain_list/...) and the
                    // Router's registered brain routes still apply above.
                    res.writeHead(410, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Retired: GET /brain (pre-registry stub, issue #187).',
                        use: 'Brain verbs live on the MCP surface (brain_read / brain_list / brain_search).'
                    }));
                    return;
                } else if (url === '/mcp' || url === '/islands') {
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

                // (crashtest #214) THE WRITE HONESTY HEADER: a POST that
                // mutated state must not be cache-replayable — a shared
                // intermediary serving the 200 from cache would fake an
                // answered write. no-store on every POST answer, 2xx or
                // otherwise (refusals carry no state to store, either).
                if (req.method === 'POST') {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Pragma', 'no-cache');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                // (crashtest #215, THE GUARD-HONESTY LAW) the security chain
                // THROWS its refusals; the dispatcher may never observe
                // "a guard refused" as "the server broke". Each guard
                // family maps to its honest HTTP class:
                //   occurred rate pressure   -> 429 + Retry-After (precise TTL)
                //   escrow budget            -> 429 (temporal, it replenishes)
                //   VAF_* validation         -> 400 (the real reason rides)
                //   chain auth               -> 401 (already distinct)
                //   bent/hostile body parse  -> 400 (SyntaxError family)
                // everything else remains a GENUINE 500 — and logs the
                // stack, because now it really is a server fault.
                let status = 500;
                let retryAfter = null;
                const isVant = e instanceof errors.VantError;
                const code = isVant ? e.code : null;
                if (isVant) {
                    if (typeof e.message === 'string' && e.message.includes('Unauthorized')) {
                        status = 401;
                    } else if (code === errors.CODES.RATE_LIMIT_EXCEEDED) {
                        status = 429;
                        try { retryAfter = this._qos ? this._qos.retryAfterSeconds() : null; } catch (_e2) { retryAfter = null; }
                    } else if (code === errors.CODES.ESCROW_DENIED) {
                        status = 429; // budget replenishes — temporal pressure
                        retryAfter = 60;
                    } else if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
                        status = e.statusCode;
                    } else if (typeof code === 'string' && code.indexOf('VAF_') === 0) {
                        status = 400;
                    } else if (code === errors.CODES.SECURITY_PATH_TRAVERSAL) {
                        // (crashtest pass-2, storage-fill class) vaf's blanket
                        // path scan runs over the RAW body too — a 5 KiB body
                        // trips 'Path too long' as SECURITY_PATH_TRAVERSAL.
                        // That is caller input mis-shape, the caller's fault:
                        // 400, never the old uncaught-limb 500.
                        status = 400;
                    }
                } else if (e instanceof SyntaxError) {
                    status = 400; // a bent body (JSON.parse, vaf) is the caller's fault
                } else if (e && typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
                    status = e.statusCode;
                } else if (typeof (e && e.message) === 'string' && e.message.includes('Unauthorized')) {
                    status = 401; // legacy untyped auth refusals keep their class too
                }
                if (status === 429 && retryAfter === null) retryAfter = 1;
                if (retryAfter !== null) res.setHeader('Retry-After', String(retryAfter));
                // (crashtest #214) refusals answer no-store as well — a
                // refusal body is a caller-specific record, never a shared
                // cacheable fact.
                if (req.method === 'POST') {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Pragma', 'no-cache');
                }
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message, requestId, code: code || undefined }));
                _emit('server:error', { error: e.message, status, requestId, fault: status >= 500 });
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
                    // pass 78: null the ref so getLayerStatus/getStatus stop
                    // reporting running:true after a real stop.
                    this._server = null;
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

    isOperationAllowed(_op) {
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
        // (R-2) resolve the root ONCE - containment checks below are absolute
        this._rootResolved = path.resolve(this.options.root);
        if (!fs.existsSync(this.options.root)) {
            _checkWrite();
            try { fs.mkdirSync(this.options.root, { recursive: true }); } catch (e) { console.warn("[server] mkdir failed:", e.message); }
        }
    }
    async serve(ctx, filePath) {
        _checkRead();
        // FIXED: the old containment check compared a RELATIVE join against an
        // ABSOLUTE root (fullPath.startsWith(path.resolve(root))) - always
        // false, so every request returned null. The traversal "protection"
        // was total denial, not containment. Now: resolve, then compare like
        // for like, plus a separator guard so prefix siblings can't escape.
        const fullPath = path.resolve(this._rootResolved, filePath);
        if (fullPath !== this._rootResolved && !fullPath.startsWith(this._rootResolved + path.sep)) return null;
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
// pass 78: shared default instance for the module-surface helpers below -
// the old helpers built a throwaway Server per call (state-laundering).
function _sharedServer() {
    if (!_shared) _shared = new Server();
    return _shared;
}
let _shared = null;

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
    _sharedServer,   // test/observability hook (pass 78)
    // pass 78: use/listen/stop built a THROWAWAY Server each call -
    // middleware registered via module .use() vanished before module
    // .listen() booted, and module .stop() could never stop what module
    // .listen() started. lib/vant.js boots HTTP through module listen(),
    // so this is the production path. Shared default instance now.
    use: (r) => _sharedServer().use(r),
    listen: (p, h) => _sharedServer().listen(p, h),
    stop: () => _sharedServer().stop(),
    getLayerStatus: () => ({ name: 'Server', type: 'http', enabled: true, state: { running: !!(_sharedServer()._server) } }),
    isOperationAllowed: (_op) => ({ allowed: true, layer: 'Server' }),
    getStatus: () => ({ enabled: true, running: !!(_sharedServer()._server) })
};
