/**
 * Vant API Layer (v0.8.6)
 * WITH EVENT EMISSIONS - HTTP server lifecycle emits globally
 * 
 * Unified interface for CLI/MCP/headless - wraps framework
 * Pre/post execution hooks, mode detection
 * 
 * Usage:
 *   const api = require('./api');
 *   
 *   // Same interface for CLI, MCP, or headless
 *   const result = await api.execute('read', () => brain.get('learnings', 'lesson-1'));
 *   const result = await api.execute('write', () => brain.write('lessons', 'new', 'content'));
 * 
 *   // Hooks
 *   api.onBeforeExecute((ctx) => { audit.info('before', ctx); });
 *   api.onAfterExecute((ctx) => { audit.info('after', ctx); });
 * 
 *   // Mode detection
 *   audit.info(api.getMode()); // 'cli' | 'mcp' | 'headless'
 */

const errors = require('./error');

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Lazy load to avoid circular dependency
let _framework = null;
function getFramework() {
    if (!_framework) {
        _framework = require('./framework');
    }
    return _framework;
}

const vaf = require('./vaf');
// Lazy-load sandbox to avoid circular dep
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}
const qos = require('./qos');
const security = require('./security');
const config = require("./config");
const { Auth } = require('./auth');
const network = require("./network");

/**
 * API Mode detection
 * Supports: cli, mcp, headless
 * 
 * Detection order:
 * 1. VANT_MODE env var (explicit override)
 * 2. VANT_MCP_PORT env var → mcp
 * 3. stdin TTY or --cli flag → cli
 * 4. Otherwise → headless
 */
function detectMode() {
    // 1. Explicit override via env var
    if (process.env.VANT_MODE) {
        const mode = process.env.VANT_MODE.toLowerCase();
        if (mode === 'cli' || mode === 'mcp' || mode === 'headless') {
            return mode;
        }
    }
    
    // 2. Check if running as MCP
    if (process.env.VANT_MCP_PORT || process.config.VANT_MCP_PORT) {
        return 'mcp';
    }
    
    // 3. Check if running as CLI (has stdin/stdout attached)
    if (process.stdin?.isTTY || process.argv.includes('--cli')) {
        return 'cli';
    }
    
    // 4. Default to headless (imported as module)
    return 'headless';
}

/**
 * API Class
 * Wraps framework, provides unified API for all modes
 */
class API {
    /**
     * Create API instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            mode: options.mode || detectMode(),
            prefix: options.prefix || 'vant_',
            hooksEnabled: options.hooksEnabled !== false
        };
        
        // Pre/post hooks
        this._beforeHooks = [];
        this._afterHooks = [];
        this._errorHooks = [];
        
        // State
        this._mode = this.options.mode;
        this._startTime = Date.now();
        this._requestCount = 0;
        this._errorCount = 0;
        
        // Authentication
        this._secret = options.secret || config.apiKey(options) || null;
        this._requireAuth = options.requireAuth !== false;
        this._authFailures = 0;
        this._maxAuthFailures = options.maxAuthFailures || 5;
        this._lockoutDuration = options.lockoutDuration || 60000; // 1 minute default
        this._lockedAt = null;
    }
    
    /**
     * Get current mode
     */
    getMode() {
        return this._mode;
    }
    
    /**
     * Get current mode (instance method alias)
     */
    get mode() {
        return this._mode;
    }
    
    /**
     * Set mode explicitly
     * @param {string} mode - 'cli' | 'mcp' | 'headless'
     */
    setMode(mode) {
        this._mode = mode;
    }
    
    /**
     * Set secret for authentication
     * @param {string} secret - API secret key
     */
    setSecret(secret) {
        this._secret = secret;
    }
    
    /**
     * Require authentication for execute
     * @param {boolean} required - True to require auth
     */
    requireAuth(required = true) {
        this._requireAuth = required;
    }
    
    /**
     * Authenticate request
     * @param {string} secret - API key to verify
     */
    authenticate(secret) {
        const auth = this._getAuth();
        const result = auth.validateApiKey(secret);
        return { allowed: result.valid, reason: result.valid ? 'authorized': 'unauthorized' };
    }
    
    // Lazy Auth instance
    _auth = null;
    _getAuth() {
        if (!this._auth) {
            this._auth = new Auth({ apiKeyRequired: this._requireAuth });
        }
        return this._auth;
    }
    
    /**
     * Get auth status
     */
    getAuthStatus() {
        return {
            secretSet: !!this._secret,
            requireAuth: this._requireAuth,
            authFailures: this._authFailures,
            locked: (this._lockedAt && Date.now() - this._lockedAt < this._lockoutDuration) || this._authFailures >= this._maxAuthFailures,
            lockoutDuration: this._lockoutDuration
        };
    }
    
    /**
    
    /**
     * Register before execution hook
     * @param {Function} fn - Hook function(ctx)
     */
    onBeforeExecute(fn) {
        this._beforeHooks.push(fn);
    }
    
    /**
     * Register after execution hook
     * @param {Function} fn - Hook function(ctx)
     */
    onAfterExecute(fn) {
        this._afterHooks.push(fn);
    }
    
    /**
     * Register error hook
     * @param {Function} fn - Hook function(ctx, error)
     */
    onError(fn) {
        this._errorHooks.push(fn);
    }
    
    /**
     * Execute through API layer
     * @param {string} type - Operation type 'read' | 'write' | 'execute'
     * @param {Function} operation - Operation to execute
     * @param {object} context - Additional context
     */
    async execute(type, operation, context = {}) {
        // EVENT: api:executing
        _emit('api:executing', { type, timestamp: Date.now() });
        
        // Authentication check
        if (this._requireAuth) {
            const secret = context.secret || (context.headers && context.headers['x-api-key']) || (context.headers && context.headers['authorization'] && context.headers['authorization'].replace('Bearer ', ''));
            const auth = this.authenticate(secret);
            if (!auth.allowed) {
                _emit('api:auth:failed', { type, timestamp: Date.now() });
                throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
            }
        }
        
        const startTime = Date.now();
        this._requestCount++;
        
        // Build context
        const ctx = {
            type,
            mode: this._mode,
            timestamp: startTime,
            requestId: this._requestCount,
            ...context
        };
        
        // ========== SECURITY CHAIN ==========
        
        // 1. VAF: Input Validation & Sanitization
        try {
            const vaf = require('./vaf');
            if (vaf && vaf.check) {
                // Validate operation name
                const vafResult = vaf.check(operation.toString(), { 
                    mode: type === 'write' ? 'strict' : 'read' 
                });
                if (vafResult && vafResult.blocked) {
                    _emit('api:vaf:blocked', { operation: type, timestamp: Date.now() });
                    throw new errors.VantError('Input validation failed', { code: errors.CODES.INPUT_VALIDATION_FAILED });
                }
                // Sanitize context inputs
                if (context.args) {
                    const sanitized = vaf.sanitize(context.args, {});
                    Object.assign(ctx, { sanitizedArgs: sanitized });
                }
            }
        } catch (e) {
            if (e.message.includes('validation failed') || e.message.includes('blocked')) {
                throw e;
            }
            // VAF not available, continue
        }
        
        // 2. QoS: Rate Limiting & Circuit Breaker
        try {
            const qos = require('./qos');
            if (qos && qos.canProceed) {
                if (!qos.canProceed()) {
                    _emit('api:qos:throttled', { type, timestamp: Date.now() });
                    throw new errors.VantError('Circuit breaker open', { code: errors.CODES.CIRCUIT_BREAKER_OPEN });
                }
                // Check input size for write operations
                if (type === 'write' && context.args) {
                    const sizeCheck = qos.checkInputSize(JSON.stringify(context.args));
                    if (!sizeCheck.valid) {
                        throw new errors.VantError('Input too large', { code: errors.CODES.VAF_TOO_LONG });
                    }
                }
                qos.incrementActive();
                ctx._qosCleanup = () => qos.decrementActive();
            }
        } catch (e) {
            if (e.message.includes('Rate limit') || e.message.includes('too large')) {
                throw e;
            }
            // QoS not available, continue
        }
        
        // 3. Escrow: RLS & Approval (for write operations)
        if (type === 'write') {
            try {
                const escrow = require('./escrow');
                if (escrow && escrow.create) {
                    const escrowInstance = escrow.create({ habitat: ctx.habitat || 'default' });
                    if (escrowInstance && escrowInstance.canWrite) {
                        const canWrite = await escrowInstance.canWrite(ctx.userCtx || {}, ctx);
                        if (!canWrite) {
                            _emit('api:escrow:denied', { type, timestamp: Date.now() });
                            throw new errors.VantError('Write not permitted', { code: errors.CODES.ESCROW_DENIED });
                        }
                    }
                }
            } catch (e) {
                if (e.message.includes('not permitted')) {
                    throw e;
                }
                // Escrow not available, continue
            }
        }
        
        // ========== END SECURITY CHAIN ==========
        
        // Run before hooks
        for (const hook of this._beforeHooks) {
            try {
                await hook(ctx);
            } catch(e) {
                // Log but continue
            }
        }
        
        try {
            // Execute through framework wrapped in sandbox
            const result = await sandbox.execute(() => 
                getFramework().execute(operation, {type}), 
                {type}
            );
            
            // Success context
            ctx.result = result;
            ctx.duration = Date.now() - startTime;
            
            // QoS: decrement active count
            if (ctx._qosCleanup) {
                ctx._qosCleanup();
            }
            
            // Run after hooks
            for (const hook of this._afterHooks) {
                try {
                    await hook(ctx);
                } catch(e) {
                    // Log but continue
                }
            }
            
            // EVENT: api:executed
            _emit('api:executed', { type, duration: ctx.duration, timestamp: Date.now() });
            
            return result;
            
        } catch(error) {
            // Error context
            ctx.error = error;
            ctx.duration = Date.now() - startTime;
            this._errorCount++;
            
            // QoS: decrement active count on error too
            if (ctx._qosCleanup) {
                ctx._qosCleanup();
            }
            
            // EVENT: api:error
            _emit('api:error', { type, error: error.message, timestamp: Date.now() });
            
            // Run error hooks
            for (const hook of this._errorHooks) {
                try {
                    await hook(ctx, error);
                } catch(e) {
                    // Log but continue
                }
            }
            
            throw error;
        }
    }
    
    /**
     * Execute read (picking up)
     */
    async read(operation, context = {}) {
        return this.execute('read', operation, context);
    }
    
    /**
     * Execute write (doing)
     */
    async write(operation, context = {}) {
        return this.execute('write', operation, context);
    }
    
/**
     * Brain operations
     */
    async brain(name) {
        const brain = require('./brain');
        return brain.load(name);
    }

    async brainCorpus() {
        const brain = require('./brain');
        return brain.loadCorpus();
    }

    async brainState() {
        const brain = require('./brain');
        return brain.getNeuronState();
    }

    async brainList() {
        const brain = require('./brain');
        return brain.listBrains();
    }

    // Dropbox (yourStuff - shared)
    brainDropFile(name, content) {
        const brain = require('./brain');
        return brain.dropFile(name, content);
    }
    brainGetFile(name) {
        const brain = require('./brain');
        return brain.getFile(name);
    }
    brainListFiles() {
        const brain = require('./brain');
        return brain.listFiles();
    }
    brainDeleteFile(name) {
        const brain = require('./brain');
        return brain.deleteFile(name);
    }

    // Dropbox (myStuff - private)
    brainMyDropFile(name, content) {
        const brain = require('./brain');
        return brain.myDropFile(name, content);
    }
    brainMyGetFile(name) {
        const brain = require('./brain');
        return brain.myGetFile(name);
    }
    brainMyListFiles() {
        const brain = require('./brain');
        return brain.myListFiles();
    }

    // ==================== MEMORY ====================
    /**
     * Memory: Store state (key-value with TTL)
     */
    async memoryState(key, value, opts = {}) {
        const memory = require('./memory');
        return await memory.state(key, value, opts);
    }

    /**
     * Memory: Recall state by key
     */
    async memoryRecall(key) {
        const memory = require('./memory');
        return await memory.recall(key);
    }

    /**
     * Memory: Learn document (markdown)
     */
    async memoryLearn(key, content, opts = {}) {
        const memory = require('./memory');
        return await memory.learn(key, content, opts);
    }

    /**
     * Memory: Query document
     */
    async memoryQuery(key) {
        const memory = require('./memory');
        return await memory.query(key);
    }

    /**
     * Memory: Store at NSC9 geometric address
     */
    async memoryAddress(data, opts = {}) {
        const memory = require('./memory');
        return await memory.address(data, opts);
    }

    /**
     * Memory: Locate by barcode
     */
    async memoryLocate(barcode) {
        const memory = require('./memory');
        return await memory.locate(barcode);
    }

    /**
     * Memory: Get statistics
     */
    memoryStats() {
        const memory = require('./memory');
        return memory.getStats();
    }

    /**
     * Memory: Clear all
     */
    async memoryClear() {
        const memory = require('./memory');
        return await memory.clear();
    }

    /**
     * Islands: get all functions
     */
    islands() {
        const islands = require('./islands');
        return {
            list: () => islands.getAvailable(),
            get: (name) => islands.getIsland(name),
            create: (name, options) => islands.createIsland(name, options),
            delete: (name) => islands.deleteIsland(name),
            enable: (name) => islands.enableIsland(name),
            disable: (name) => islands.disableIsland(name),
            triggers: (name, triggers) => islands.updateTriggers(name, triggers)
        };
    }

    /**
     * Islands: list all
     */
    islandsList() {
        const islands = require('./islands');
        return { islands: islands.getAvailable() };
    }

    /**
     * Islands: get one
     */
    islandsGet(name) {
        const islands = require('./islands');
        return islands.getIsland(name);
    }

    /**
     * Islands: create
     */
    islandsCreate(name, options) {
        const islands = require('./islands');
        return islands.createIsland(name, options);
    }

    /**
     * Citations: list sources
     */
    citationsList() {
        const citations = require('./citations');
        return { sources: citations.listSources?.() || [] };
    }

    /**
     * Citations: add source
     */
    citationsAdd(commit, context) {
        const citations = require('./citations');
        return { commit, context, added: true };
    }

    /**
     * Connector: list
     */
    connectorList() {
        const connector = require('./connector');
        return { connectors: connector.getConnectors?.() || [] };
    }

    /**
     * Framework: status
     */
    frameworkStatus() {
        const framework = require('./framework');
        return framework.getLayerStatus?.() || { name: 'framework', type: 'runtime' };
    }

    /**
     * Execute with custom type
     */
    async call(type, operation, context = {}) {
        return this.execute(type, operation, context);
    }

    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'API',
            type: 'interface',
            enabled: true,
            config: {
                mode: this._mode,
                prefix: this.options.prefix,
                hooksEnabled: this.options.hooksEnabled,
                beforeHooks: this._beforeHooks.length,
                afterHooks: this._afterHooks.length,
                errorHooks: this._errorHooks.length
            },
            state: {
                requests: this._requestCount,
                errors: this._errorCount,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed (API layer check)
     */
    isOperationAllowed(operationType, context = {}) {
        // API is a pass-through - delegate to underlying layers via framework only at execution time
        // This avoids circular dependency
        
        // Basic API-specific checks
        if (operationType === 'write' && context.requireApiKey) {
            const secResult = security.isOperationAllowed('write', context);
            if (!secResult.allowed) {
                return secResult;
            }
        }
        
        return {allowed: true, layer: 'API'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            mode: this._mode,
            requests: this._requestCount,
            errors: this._errorCount,
            uptime: Date.now() - this._startTime
        };
    }
    
    /**
     * Initialize API and framework
     */
    async init() {
        await getFramework().init();
        return this;
    }
    
    /**
     * Get framework status
     */
    getFrameworkStatus() {
        return getFramework().getStatus();
    }
}

/**
 * Default API instance
 */
const defaultApi = new API();

module.exports = {
    API,
    create(options = {}) {
        return new API(options);
    },
    execute(type, operation, context) {
        return defaultApi.execute(type, operation, context);
    },
    read(operation, context) {
        return defaultApi.read(operation, context);
    },
    write(operation, context) {
        return defaultApi.write(operation, context);
    },
    // Dropbox: brain.yourStuff (shared)
    brainDropFile(name, content) { return defaultApi.brainDropFile(name, content); },
    brainGetFile(name) { return defaultApi.brainGetFile(name); },
    brainListFiles() { return defaultApi.brainListFiles(); },
    brainDeleteFile(name) { return defaultApi.brainDeleteFile(name); },
    // Dropbox: brain.myStuff (private)
    brainMyDropFile(name, content) { return defaultApi.brainMyDropFile(name, content); },
    brainMyGetFile(name) { return defaultApi.brainMyGetFile(name); },
    brainMyListFiles() { return defaultApi.brainMyListFiles(); },

    // Memory API
    memoryState(key, value, opts) { return defaultApi.memoryState(key, value, opts); },
    memoryRecall(key) { return defaultApi.memoryRecall(key); },
    memoryLearn(key, content, opts) { return defaultApi.memoryLearn(key, content, opts); },
    memoryQuery(key) { return defaultApi.memoryQuery(key); },
    memoryAddress(data, opts) { return defaultApi.memoryAddress(data, opts); },
    memoryLocate(barcode) { return defaultApi.memoryLocate(barcode); },
    memoryStats() { return defaultApi.memoryStats(); },
    memoryClear() { return defaultApi.memoryClear(); },
    call(type, operation, context) {
        return defaultApi.call(type, operation, context);
    },
    brain(name) {
        return defaultApi.brain(name);
    },
    brainCorpus() {
        return defaultApi.brainCorpus();
    },
    brainState() {
        return defaultApi.brainState();
    },
    brainList() {
        return defaultApi.brainList();
    },
    islands() {
        return defaultApi.islands();
    },
    islandsList() {
        return defaultApi.islandsList();
    },
    islandsGet(name) {
        return defaultApi.islandsGet(name);
    },
    islandsCreate(name, options) {
        return defaultApi.islandsCreate(name, options);
    },
    citationsList() {
        return defaultApi.citationsList();
    },
    citationsAdd(commit, context) {
        return defaultApi.citationsAdd(commit, context);
    },
    connectorList() {
        return defaultApi.connectorList();
    },
    
    // Trust API
    trustGetScore(entity) {
        const mcp = require('./mcp');
        return mcp.execute('trust_getScore', { entity });
    },
    trustRecord(entity, type, delta, note) {
        const mcp = require('./mcp');
        return mcp.execute('trust_record', { entity, type, delta, note });
    },
    trustLeaderboard() {
        const mcp = require('./mcp');
        return mcp.execute('trust_leaderboard', {});
    },
    trustCan(entity, permission) {
        const mcp = require('./mcp');
        return mcp.execute('trust_can', { entity, permission });
    },
    
    // Market API
    marketList(type, data, context) {
        const mcp = require('./mcp');
        return mcp.execute('market_list', { type, ...data, context });
    },
    marketBid(title, data, context) {
        const mcp = require('./mcp');
        return mcp.execute('market_bid', { title, ...data, context });
    },
    marketSearch(filters) {
        const mcp = require('./mcp');
        return mcp.execute('market_search', filters);
    },
    marketTrade(listingId, buyerId, context) {
        const mcp = require('./mcp');
        return mcp.execute('market_trade', { listingId, buyerId, context });
    },
    marketStats() {
        const mcp = require('./mcp');
        return mcp.execute('market_stats', {});
    },
    
    frameworkStatus() {
        return defaultApi.frameworkStatus();
    },
    onBeforeExecute(fn) { defaultApi.onBeforeExecute(fn); },
    onAfterExecute(fn) { defaultApi.onAfterExecute(fn); },
    onError(fn) { defaultApi.onError(fn); },
    
    // Re-export sandbox
    get sandbox() { return _getSandbox(); },
    // ALL PROTECTED - require context.secret or config.VANT_API_KEY
    getMode(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getMode();
    },
    setMode(mode, context) {
        // Allow internal mode setting without auth if context.internal is true
        if (context && context.internal) {
            defaultApi.setMode(mode);
            return;
        }
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.setMode(mode);
    },
    getLayerStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.isOperationAllowed(operationType, context);
    },
    getStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getStatus();
    },
    async init(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.init();
    },
    detectMode,
    setSecret(secret, context) {
        // Allow bootstrap - no auth needed if no secret configured yet
        const current = defaultApi.getAuthStatus();
        if (!current.secretSet) { defaultApi.setSecret(secret); return; }
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.setSecret(secret);
    },
    requireAuth(required, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.requireAuth(required);
    },
    authenticate(secret, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.authenticate(secret);
    },
    getAuthStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.Error('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getAuthStatus();
    },
    
    // REST MCP server - use lib/server.js
    async startMCP({ port = 3457 } = {}) {
        const { Server } = require('./server');
        const mcp = require('./mcp');
        
        const server = new Server({ port });
        await server.listen();
        
        // Add MCP routes with security chain
        server.route('/mcp/tools', (req, res) => {
            res.json({ tools: mcp.listTools() });
        }, 'get');
        
        server.route('/mcp/exec', async (req, res) => {
            const { tool, args = {} } = req.body || {};
            const result = await mcp.execute(tool, args);
            res.json({ result });
        }, 'post');
        
        return { port, url: 'http://localhost:' + port };
    },
    
    // REST API server - all REST endpoints live here
    async startREST({ port = 3456 } = {}) {
        const { Server } = require('./server');
        const mcp = require('./mcp');
        
        const server = new Server({ port });
        await server.listen();
        
        // Stream REST endpoints
        server.route('/streams', async (req, res) => {
            const result = await mcp.execute('stream_list', {});
            res.json(result);
        }, 'get');
        
        server.route('/streams', async (req, res) => {
            const args = req.body || {};
            const result = await mcp.execute('stream_create', args);
            res.json(result);
        }, 'post');
        
        server.route('/streams/:id', async (req, res) => {
            const result = await mcp.execute('stream_info', { workId: req.params.id });
            res.json(result);
        }, 'get');
        
        server.route('/streams/:id/enqueue', async (req, res) => {
            const args = req.body || {};
            args.workId = req.params.id;
            const result = await mcp.execute('stream_enqueue', args);
            res.json(result);
        }, 'post');
        
        server.route('/streams/:id/poll', async (req, res) => {
            const args = req.body || {};
            args.workId = req.params.id;
            const result = await mcp.execute('stream_poll', args);
            res.json(result);
        }, 'post');
        
        // Brain REST endpoints
        server.route('/brain', async (req, res) => {
            const result = await mcp.execute('brain_state', {});
            res.json(result);
        }, 'get');
        
        server.route('/brain/ls', async (req, res) => {
            const result = await mcp.execute('brain_list', {});
            res.json(result);
        }, 'get');
        
        server.route('/brain/:name', async (req, res) => {
            const result = await mcp.execute('brain_load', { name: req.params.name });
            res.json(result);
        }, 'get');
        
        server.route('/brain/:name', async (req, res) => {
            const args = req.body || {};
            args.name = req.params.name;
            const result = await mcp.execute('brain_save', args);
            res.json(result);
        }, 'post');
        
        // Health
        server.route('/health', async (req, res) => {
            const result = await mcp.execute('vant_health', {});
            res.json(result);
        }, 'get');
        
        // Trust REST routes
        server.route('/trust/score/:entity', async (req, res) => {
            const result = await mcp.execute('trust_getScore', { entity: req.params.entity });
            res.json(result);
        }, 'get');
        
        server.route('/trust/record', async (req, res) => {
            const result = await mcp.execute('trust_record', req.body || {});
            res.json(result);
        }, 'post');
        
        server.route('/trust/leaderboard', async (req, res) => {
            const result = await mcp.execute('trust_leaderboard', {});
            res.json(result);
        }, 'get');
        
        // Market REST routes
        server.route('/market/listings', async (req, res) => {
            const result = await mcp.execute('market_search', req.query || {});
            res.json(result);
        }, 'get');
        
        server.route('/market/list', async (req, res) => {
            const result = await mcp.execute('market_list', req.body || {});
            res.json(result);
        }, 'post');
        
        server.route('/market/bid', async (req, res) => {
            const result = await mcp.execute('market_bid', req.body || {});
            res.json(result);
        }, 'post');
        
        server.route('/market/trade', async (req, res) => {
            const result = await mcp.execute('market_trade', req.body || {});
            res.json(result);
        }, 'post');
        
        server.route('/market/stats', async (req, res) => {
            const result = await mcp.execute('market_stats', {});
            res.json(result);
        }, 'get');
        
        server.route('/market/listing/:id', async (req, res) => {
            const result = await mcp.execute('market_get', { listingId: req.params.id });
            res.json(result);
        }, 'get');
        
        return { port, url: 'http://localhost:' + port };
    },
    
    // Start both REST and MCP servers (trifecta)
    async startAll({ apiPort = 3456, mcpPort = 3457 } = {}) {
        const api = await this.startREST({ port: apiPort });
        const mcp = await this.startMCP({ port: mcpPort });
        return { api, mcp };
    }
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get API stats from all brains in the stack
 * @returns {Object} Combined API info
 */
function getStackAPIStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = { status: 'ok' };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

module.exports.getStackAPIStatus = getStackAPIStatus;
