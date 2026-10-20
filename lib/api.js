/**
 * Vant API Layer (v0.8.6)
 * WITH EVENT EMISSIONS - HTTP server lifecycle emits globally
 *
 * Unified interface for CLI/MCP - wraps framework (headless is a serving
 * pod from its own door per #187, not a detected default)
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
        _framework = require('./vant');
    }
    return _framework;
}

require('./vaf');
// Lazy-load sandbox to avoid circular dep
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}
require('./qos');
const security = require('./security');
const pipeline = require('./pipeline');
const config = require("./config");
const { Auth } = require('./auth');
require("./network");

/**
 * API Mode detection
 * Supports: cli, mcp (explicit), headless (EXPLICIT serving mode only)
 *
 * (issue #187 retire: the cli/mcp/headless sibling-invocation fossil) —
 * "headless" is NO LONGER the ambient import fallback. An imported
 * module claims no serving origin; the headless POD comes from its door
 * (`vant headless` / startHeadless), never from import detection.
 *
 * Detection order:
 * 1. VANT_MODE env var (explicit override, incl. an explicit 'headless')
 * 2. VANT_MCP_PORT env var → mcp
 * 3. stdin TTY or --cli flag → cli
 * 4. Otherwise → null (imported as module: no origin claimed; serving
 *    modes come from doors, not from being imported)
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

    // 4. Imported as module: no serving origin claimed (#187 retire of the
    // ambient headless fallback). Explicit VANT_MODE=headless still works.
    return null;
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
            mode: options.mode !== undefined ? options.mode : detectMode(),
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
     * Set mode explicitly
     * @param {string|null} mode - 'cli' | 'mcp' | 'headless' | null (imported: no claim)
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
                throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
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
            name: operation?.name || (typeof operation === 'function' ? operation.toString().slice(0, 50) : String(operation)),
            ...context
        };

        // Determine pipeline mode from type
        const pipelineMode = type === 'write' ? pipeline.PRIVATE : pipeline.PUBLIC;

        // Run before hooks
        for (const hook of this._beforeHooks) {
            try {
                await hook(ctx);
            } catch(e) {
                // Log but continue
            }
        }

        try {
            // Execute through unified pipeline (replaces inline security chain)
            const result = await pipeline.run(
                ctx,
                async () => {
                    return await getFramework().execute(operation, { type });
                },
                { mode: pipelineMode }
            );

            // Success context
            ctx.result = result;
            ctx.duration = Date.now() - startTime;

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
                require('./citations');
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
        const vant = require('./vant');
        return vant.getStatus?.() || { name: 'framework', type: 'runtime' };
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
    // (pass 271 e2e rung) the SHARED ride core — the relay_ride door verb
    // answers through this, so webhook and door can never drift apart.
    rideAnswer,
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
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
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
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.setMode(mode);
    },
    getLayerStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.isOperationAllowed(operationType, context);
    },
    getStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.getStatus();
    },
    async init(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.init();
    },
    detectMode,
    setSecret(secret, context) {
        // Allow bootstrap - no auth needed if no secret configured yet
        const current = defaultApi.getAuthStatus();
        if (!current.secretSet) { defaultApi.setSecret(secret); return; }
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.setSecret(secret);
    },
    requireAuth(required, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        defaultApi.requireAuth(required);
    },
    authenticate(secret, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
        return defaultApi.authenticate(secret);
    },
    getAuthStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new errors.VantError('Unauthorized', { code: errors.CODES.AUTH_DENIED || 'AUTH_DENIED', retryable: false });
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

    // Start both REST and MCP servers (all mode)
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

// ==================== THE RELAY FACE (r/2 — webhook-native) ================
/**
 * Vant Relay — the r/2 face (prd-relay.md v0.2.1). NOT a module of its own:
 * the ruling (recorded in labs/TASKS.md, pass 236) is that the relay has no
 * house in lib/ — it is composed OUT OF the existing webhook/door transports:
 *
 *   intake      = lib/webhooks.js (HMAC-verified routes, replay gate, 1 MiB
 *                 cap) — the relay registers ONE route, exactly like a crew
 *                 node does; the gate IS the route's HMAC secret.
 *   outbound    = lib/network.fetch (SSRF IP wall, DNS-rebinding refusal,
 *                 circuit breaker, system:true transport).
 *   envelope    = lib/encrypt.js (Encrypt.encrypt/decrypt AES-256-GCM,
 *                 Encrypt.hmacSign/hmacVerify — zero new crypto, crew-bus
 *                 precedent).
 *   dispatch    = the pod's OWN MCP door (127.0.0.1 POST /mcp/exec) — the
 *                 door's full auth chain stays the single authority.
 *   boot        = vant.startFull/startHeadless mount this face when the
 *                 relay posture is ON; the dashboard is a SECONDARY
 *                 consumer of the same r/2 wire (web/kit).
 *
 * THE WIRE (r/2, one registered POST route, path `relay`):
 *   header  X-Signature-256: HMAC-SHA256 hex over the RAW UTF-8 body bytes.
 *   body    { event: 'relay.hop' | 'relay.ride', from, ts, nonce,
 *             payload, v: { major: 2 } }  (crew-bus envelope shape)
 *   relay.hop  payload = { origin, path, ct }  — forward, answer rides the
 *             ack back (ack.reply.raw verbatim).
 *   relay.ride payload = { ct } — the e2e envelope opens with the pod's
 *             channel key; inner = { nonce, bearer?, body } dispatches to
 *             the door; the door's answer re-envelopes and rides the ack.
 * The relay stays BLIND: gate secret spent at verification, channel key
 * never held, bodies only ever ciphertext.
 */

const rErrors = require('./error');

const RELAY_CONTRACT = 'r/2';
const RELAY_ROUTE = 'relay';              // webhooks path: POST /relay
const RELAY_SOURCE = 'vant-relay';
const RELAY_SIGNATURE_HEADER = 'X-Signature-256';
const RELAY_EVENT_HOP = 'relay.hop';
const RELAY_EVENT_RIDE = 'relay.ride';
// (pass 254) the Traveler — the ENTERPRISE router object (the industrial
// lane's counterpart in prd-automation.md): a schema-versioned,
// content-addressed state packet riding 'relay.travel'. The face mirrors
// the kit's law as a PLAIN COPY (the pod never requires web/), and the
// fresh suite pins the copy to kit head (test/traveler.test.js).
const RELAY_EVENT_TRAVEL = 'relay.travel';
const RELAY_TRAVEL_VERSION = 'tr/1';
const RELAY_TRAVEL_KNOWN = ['tr/1', 'tr/0'];
const RELAY_WIRE_MAJOR = 2;
const RELAY_HOP_TIMEOUT_MS = 15000;
const RIDE_NONCE_TTL_MS = 10 * 60 * 1000;
const RIDE_NONCE_CAP = 4096;

let _eventMod = null;
function _rEmit(event, data) {
    if (!_eventMod) {
        try { _eventMod = require('./event'); } catch (e) { return; }
    }
    if (_eventMod && _eventMod.emit) _eventMod.emit(event, data);
}

function _truthy(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

function _relayConfig() {
    const config = require('./config');
    return {
        get enabled() { return _truthy(config.get('relay.enabled')); },
        get gateKey() {
            const k = config.get('relay.gateKey');
            return (typeof k === 'string' && k.length >= 16) ? k : null;
        },
        get channelKey() {
            const k = config.get('relay.channelKey');
            return (typeof k === 'string' && k.length >= 16) ? k : null;
        },
        get allowPrivate() {
            return _truthy(config.get('relay.allowPrivateOrigins'));
        },
        get intranet() {
            return _truthy(config.get('relay.intranetOrigins'));
        }
    };
}

/** (pass 270) THE ORIGIN POLICY — one resolver, three postures (order =
 *  widening):
 *
 *  1. PUBLIC (default): https:// origins only; outbound rides the standing
 *     SSRF wall (private IPs, DNS rebinding, cloud metadata refused).
 *  2. INTRANET (relay.intranetOrigins true, the LAN-scope posture): plain
 *     http:// is admitted ONLY for private-LAN scopes (loopback / RFC1918 /
 *     IPv6 ULA — network.isPrivateLanIP is the law). The SSRF wall STAYS
 *     scoped: the privateLan fetch policy still refuses link-local (cloud
 *     metadata), multicast and 0.0.0.0 — a pod on a LAN can relay to its
 *     neighbors without becoming a LAN prober.
 *  3. LAB ESCAPE (relay.allowPrivateOrigins true): the full pre-270 escape,
 *     unchanged — http anywhere + skipDomainCheck. Host posture, never a
 *     default.
 *
 *  Typed refusal is E_RELAY_BAD_ORIGIN in every refusal branch (one
 *  language); exported for the test pins. */
function _relayOriginPolicy(origin, cfg) {
    const refusal = (error) => ({ ok: false, code: 'E_RELAY_BAD_ORIGIN', error });
    if (typeof origin !== 'string' || !origin.length) return refusal('an origin is required.');
    let u = null;
    try { u = new URL(origin); } catch (e) { return refusal('the origin does not parse.'); }
    const scheme = u.protocol.replace(/:$/, '');
    if (scheme === 'https') return { ok: true, policy: 'refuse' };
    if (cfg.allowPrivate) return { ok: true, policy: 'off' };
    if (cfg.intranet) {
        if (scheme !== 'http') return refusal('plain ' + scheme + ': is never admitted (intranet posture scopes plain http to LAN scopes; https for the open wire).');
        const network = require('./network');
        if (typeof network.isPrivateLanIP === 'function' && network.isPrivateLanIP(u.hostname)) {
            return { ok: true, policy: 'privateLan' };
        }
        return refusal('http origin is not a private-LAN scope (intranet posture admits loopback/RFC1918; https-only for the open wire).');
    }
    return refusal('https-only origins (relay.intranetOrigins scopes loopback/RFC1918 LAN lanes; relay.allowPrivateOrigins opens the full lab escape).');
}

// ---- counters (liveness: about FLOW, never a ledger) ----------------------
const _relayStats = {
    startedAt: Date.now(),
    hopsServed: 0,
    hopsForwarded: 0,
    gateRefused: 0,
    ridesServed: 0,
    rideDecodeRefused: 0,
    ridesReplayed: 0,
    upstreamRefs: 0
};

function _relayNonceTouched(nonce) {
    const now = Date.now();
    const seen = _relayNonces;
    for (const [n, exp] of seen) if (exp <= now) seen.delete(n);
    if (seen.size >= RIDE_NONCE_CAP) {
        seen.delete(seen.keys().next().value); // FIFO
    }
    if (seen.has(nonce)) return true;
    seen.set(nonce, now + RIDE_NONCE_TTL_MS);
    return false;
}
// seen-nonce map: TTL allowing this to be the bounded map
const _relayNonces = new Map();

// ---- envelope law (Pure AOxcrypt: lib/encrypt is the ONLY crypto canon) ---
function relayEnvelope(payload, channelKey) {
    const Encrypt = require('./encrypt').default;
    return Encrypt.encrypt(String(payload), channelKey);
}
function relayOpenEnvelope(ct, channelKey) {
    const Encrypt = require('./encrypt').default;
    return Encrypt.decrypt(String(ct), channelKey);
}

// ---- dispatch: the pod's OWN door (loopback POST, door auth intact) -------
let _doorTransport = null;
function setDoorTransport(fn) { _doorTransport = (typeof fn === 'function') ? fn : null; }
function _loopbackDoorTransport() {
    return async ({ bearer, body }) => {
        const http = require('http');
        const config = require('./config');
        let host = String(config.mcpBindAddress() || '127.0.0.1').replace(/^\[|\]$/g, '');
        if (host === '0.0.0.0' || host === '::' || host === '*') host = '127.0.0.1';
        const port = parseInt(config.mcpPort(), 10) || 3457;
        const payload = JSON.stringify(body);
        return await new Promise((resolve) => {
            const req = http.request({
                host, port, path: '/mcp/exec', method: 'POST', timeout: RELAY_HOP_TIMEOUT_MS,
                headers: Object.assign({ 'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload) },
                    bearer ? { Authorization: 'Bearer ' + bearer } : null)
            }, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (c) => { if (data.length < (1024 * 1024)) data += c; });
                res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data }));
            });
            req.on('timeout', () => req.destroy(new Error('door timeout')));
            req.on('error', (e) => resolve({ ok: false, status: 0, body: '', error: e.message }));
            req.end(payload);
        });
    };
}
function _getDoorTransport() { return _doorTransport || _loopbackDoorTransport(); }

// ---- the two dispatch handlers (subscribed at mount) ----------------------

/** relay.hop: this pod IS the relay — forward and answer. */
async function _dispatchHop(ctx) {
    const { body, _dispatchState } = ctx;
    try {
        const payload = body && body.payload;
        const frame = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : null;
        const origin = frame ? frame.origin : null;
        const path = frame ? frame.path : null;
        const ct = frame ? frame.ct : null;
        const cfg = _relayConfig();
        // (pass 270) THE ORIGIN POLICY (the posture ends here, typed):
        // https-only public / scoped-LAN intranet / full lab escape.
        const policy = _relayOriginPolicy(origin, cfg);
        if (!policy.ok) {
            _relayStats.gateRefused++;
            _dispatchState.reply = { ok: false, code: policy.code, error: policy.error };
            return;
        }
        if (!path || typeof path !== 'string' || !/^\//.test(path) || path.includes('..')) {
            _relayStats.gateRefused++;
            _dispatchState.reply = { ok: false, code: 'E_RELAY_BAD_PATH', error: 'rooted, sane path required.' };
            return;
        }
        if (!ct || typeof ct !== 'string' || ct.length > (1024 * 512)) {
            _relayStats.gateRefused++;
            _dispatchState.reply = { ok: false, code: 'E_RELAY_NEEDS_ENVELOPE', error: 'the hop body must be an AES-256-GCM envelope < 512 KiB.' };
            return;
        }
        // Encrypted tx is the DEFAULT (the law survived the r/1 -> r/2 move):
        // a hop body that is not an ENVELOPE shape (salt:iv:tag:cipher hex,
        // lib/encrypt.js canon) is a typed refusal, never a downgrade.
        if (!new RegExp('^[0-9a-f]{32}:[0-9a-f]{24,32}:[0-9a-f]{32}:[0-9a-f]{2,}$').test(ct)) {
            _relayStats.gateRefused++;
            _dispatchState.reply = { ok: false, code: 'E_RELAY_NEEDS_ENVELOPE', error: 'hop ct is not an envelope shape (salt:iv:tag:cipher) - plaintext never hops.' };
            return;
        }
        // OUTBOUND = lib/network.fetch: the SSRF IP wall, DNS-rebinding
        // refusal and circuit breaker are ALREADY there — nothing here does
        // its own networking.
        const network = require('./network');
        const t0 = Date.now();
        let raw = null;
        try {
            // (pass 270) The origin policy's posture dial IS the fetch dial:
            //   refuse    -> the standing SSRF wall (default)
            //   privateLan-> LAN carve-out, link-local/multicast STILL refused
            //   off       -> the lab escape (skipDomainCheck, unchanged)
            raw = await network.fetch(origin + path, {
                method: 'POST',
                body: JSON.stringify({ ct }),
                headers: { 'content-type': 'application/json' },
                timeout: RELAY_HOP_TIMEOUT_MS,
                circuit: true,
                system: true,
                cache: false,
                skipDomainCheck: policy.policy === 'off',
                internalPolicy: policy.policy === 'privateLan' ? 'privateLan' : 'refuse'
            });
        } catch (e) {
            _relayStats.upstreamRefs++;
            _dispatchState.reply = { ok: false, code: 'E_RELAY_UPST', error: 'upstream unreachable: ' + e.message, ms: Date.now() - t0 };
            return;
        }
        _relayStats.hopsForwarded++;
        _relayStats.hopsServed++;
        const rawText = (typeof raw === 'string') ? raw : String(raw);
        _rEmit('relay:hop:served', { origin, bytes: rawText.length, ms: Date.now() - t0, timestamp: Date.now() });
        _dispatchState.reply = { ok: true, raw: rawText, ms: Date.now() - t0 };
    } catch (e) {
        _dispatchState.reply = { ok: false, code: 'E_RELAY_UPST', error: e.message };
    }
}

/** relay.ride: this pod is the ENDPOINT — open, check, dispatch to the door. */
async function _dispatchRide(ctx) {
    const { body, _dispatchState } = ctx;
    const payload = body && body.payload;
    const ct = (payload && typeof payload === 'object') ? payload.ct : null;
    // (pass 271 e2e rung) ONE LAW, BOTH FACES: the webhook dispatch and the
    // relay_ride door verb share this exact answer core — the ride rules
    // (decode, replay, dispatch, re-seal) can never drift between faces.
    _dispatchState.reply = await rideAnswer(ct);
}

/**
 * (pass 271 e2e rung, prd-relay.md §5) THE RIDE CORE: open the sealed e2e
 * envelope with this pod's channel key, ride the inner door call through
 * the REAL door transport, and re-seal the answer. Shared by the webhook
 * relay.ride dispatch AND the relay_ride door verb. Returns a reply-capable
 * ack object: { ok:true, rode:true, ct } or { ok:false, code, error } from
 * the typed E_RIDE_* family — never an HTTP class, never silent.
 * @param {string|null} ct the AES-256-GCM envelope (Encrypt canon)
 */
async function rideAnswer(ct) {
    const cfg = _relayConfig();
    try {
        if (!cfg.enabled || !cfg.channelKey) {
            return { ok: false, code: 'E_RIDE_OFFLINE',
                error: 'the ride face is not bound: relay.enabled + relay.channelKey required (vant relay channel).' };
        }
        if (!ct || typeof ct !== 'string') {
            _relayStats.rideDecodeRefused++;
            return { ok: false, code: 'E_RIDE_DECODE', error: 'the ride expects the e2e envelope payload { ct }.' };
        }
        let inner = null;
        try {
            inner = JSON.parse(relayOpenEnvelope(ct, cfg.channelKey));
        } catch (e) {
            _relayStats.rideDecodeRefused++;
            return { ok: false, code: 'E_RIDE_DECODE',
                error: 'this ride could not open with this pod\'s channel key (wrong or stale).' };
        }
        const nonce = (inner && typeof inner === 'object') ? inner.nonce : null;
        if (!nonce || !/^[a-z0-9-]{16,64}$/i.test(nonce)) {
            _relayStats.rideDecodeRefused++;
            return { ok: false, code: 'E_RIDE_DECODE', error: 'ride inner payload needs a nonce (16-64 url-safe chars).' };
        }
        if (_relayNonceTouched(nonce)) {
            _relayStats.ridesReplayed++;
            return { ok: false, code: 'E_RIDE_REPLAY',
                error: 'this ride nonce was already used inside the TTL window - replays refuse.' };
        }
        // (pass 272, prd-relay.md §5 rung 2) CONTEXT-NONCE BINDING: the
        // ciphertext binds to the request context it was sealed FOR —
        // { origin, path } + the same nonce — verified client-side per
        // route and enforced here. A ctx-less (or nonce-mismatched) ride
        // is a DOWNGRADE attempt, refused typed, never salvaged.
        const ctx = (inner && typeof inner === 'object') ? inner.ctx : null;
        if (!ctx || typeof ctx !== 'object'
            || typeof ctx.origin !== 'string' || ctx.origin.length < 1 || ctx.origin.length > 253
            || typeof ctx.path !== 'string' || !/^\//.test(ctx.path) || ctx.path.length > 512
            || ctx.nonce !== nonce) {
            _relayStats.rideDecodeRefused++;
            return { ok: false, code: 'E_RIDE_DECODE',
                error: 'ride refuses its downgrade by construction: the seal must bind its context ctx { origin, path, nonce:nonce } (prd-relay.md §5 rung 2).' };
        }
        const innerBody = inner.body;
        if (!innerBody || typeof innerBody !== 'object' || !(typeof innerBody.tool === 'string' || typeof innerBody.method === 'string')) {
            _relayStats.rideDecodeRefused++;
            return { ok: false, code: 'E_RIDE_DECODE', error: 'ride body must carry a tool/method call.' };
        }
        const up = await _getDoorTransport()({
            bearer: (typeof inner.bearer === 'string' && inner.bearer) ? inner.bearer : null,
            body: innerBody
        });
        if (!up || !up.ok || typeof up.body !== 'string') {
            return { ok: false, code: 'E_RIDE_DISPATCH', error: 'the door could not be reached or answered nothing.' };
        }
        _relayStats.ridesServed++;
        _rEmit('relay:ride:served', { bytes: up.body.length, timestamp: Date.now() });
        // (pass 272) the ANSWER binds to the request nonce too: the client
        // opens it and refuses any record whose nonce ≠ the nonce it sent
        // (the W1 lesson from pass 268 — a swapped or replayed answer can
        // no longer be spliced into a different request).
        return { ok: true, rode: true, ct: relayEnvelope(JSON.stringify({ nonce, answer: up.body }), cfg.channelKey) };
    } catch (e) {
        return { ok: false, code: 'E_RIDE_DISPATCH', error: e.message };
    }
}

// ---- the interface-handler bridge (pass 237, §3.3) ------------------------
// sync / lost / call: typed families that TRANSLATE onto the door's
// existing verbs - the webapp hands INTENT, the face spends its own gate
// and pod-realm bearer; auth, tunneling, trimming all handled HERE so
// front-end or back-end code never rolls their own door plumbing.
// Errors: E_RIDE_* family reused on purpose - the bridge IS a ride, only
// one refusal language per door disposition.

// ---- the Traveler law (plain copy of web/kit/contracts/traveler-contract.js) --
// mirrors the kit exactly: opaque hex address, ledger append-only with
// ascending seq, seq == ledger length, known-schema set, rizer never
// guesses forward. Structural only; identity-by-content stays sender-side.
function _travelerShapeRel(t) {
    const refusal = (err) => err;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return refusal('travel expects the traveler object');
    if (typeof t.tr !== 'string' || RELAY_TRAVEL_KNOWN.indexOf(t.tr) === -1) {
        return /^tr\//.test(String(t.tr)) ? 'E_TRAVELER_SCHEMA' : 'E_TRAVELER_SHAPE';
    }
    if (typeof t.id !== 'string' || !/^[0-9a-f]{16,64}$/.test(t.id)) return 'E_TRAVELER_ADDRESS';
    if (!t.slots || typeof t.slots !== 'object' || Array.isArray(t.slots)) return 'E_TRAVELER_SHAPE';
    if (!Array.isArray(t.steps) || !t.steps.length) return 'E_TRAVELER_STEP';
    let lastSeq = 0;
    for (const s of t.steps) {
        if (!s || typeof s !== 'object' || typeof s.op !== 'string' || s.seq !== lastSeq + 1) return 'E_TRAVELER_STEP';
        lastSeq = s.seq;
    }
    if (typeof t.seq !== 'number' || t.seq !== t.steps.length) return 'E_TRAVELER_STEP';
    return null;
}

function _travelerToDoor(t) {
    // the r/2 bridge translates onto the door's EXISTING verbs: the packet
    // lands as one brain_write record, schema-stamped, id-named (hex, so
    // the door's own name sanitation has nothing to fear).
    return [{ tool: 'brain_write', args: {
        name: 'traveler-' + t.id + '-tr' + (String(t.tr).endsWith('1') ? '1' : String(t.tr).slice(3)) + '.json',
        content: JSON.stringify(t),
        format: 'json'
    } }];
}

const RELAY_BRIDGE_FAMILIES = Object.freeze({
    // keyed BY THE WIRE EVENT (the face dispatches by envelope event string)
    'relay.sync': {
        // entries land through the door's EXISTING brain_write
        guard(payload) {
            return (payload && typeof payload === 'object' && !Array.isArray(payload)
                && typeof payload.name === 'string'
                && typeof payload.content === 'string') ? null
                : 'sync expects { name, content, format? } (or { entries: [..] } of those).';
        },
        toDoor(payload) {
            const entries = Array.isArray(payload.entries) && payload.entries.length
                ? payload.entries : [payload];
            return entries.slice(0, 64).map((en) => ({
                tool: 'brain_write',
                args: { name: en.name, content: en.content, format: en.format }
            }));
        }
    },
    'relay.lost': {
        // the beacon: the door's own posture truth answers WHERE one stands
        guard(payload) {
            return (payload && typeof payload === 'object' || payload === undefined) ? null
                : 'lost takes {} or { hint: <string> } (context rides nothing - the door answers posture).';
        },
        toDoor() {
            return [{
                tool: 'context_heartbeat',
                args: { action: 'status' }
            }, {
                tool: 'brain_current',
                args: {}
            }];
        }
    },
    'relay.call': {
        // the api bridge: any door tool call
        guard(payload) {
            return (payload && typeof payload === 'object' && !Array.isArray(payload)
                && (typeof payload.tool === 'string' || typeof payload.method === 'string')) ? null
                : 'call expects { tool | method, args? } - the door verifies the rest.';
        },
        toDoor(payload) {
            return [{ tool: payload.tool || payload.method, args: payload.args }];
        }
    },
    // (pass 254) the Traveler family: the enterprise router object lands
    // through the r/2 bridge. guard = the kit's structural law (plain
    // copy, parity-pinned to kit head); toDoor = the door's brain_write
    // record slot, id-named so the ledger is address-greppable.
    'relay.travel': {
        guard(payload) {
            return _travelerShapeRel(payload) || null;
        },
        toDoor(payload) {
            return _travelerToDoor(payload);
        }
    }
});

async function _dispatchBridge(event, payload, extra) {
    const family = RELAY_BRIDGE_FAMILIES[event];
    if (!family) {
        return { ok: false, code: 'E_RELAY_UNKNOWN_EVENT', error: 'unknown relay event (bridge: relay.sync | relay.lost | relay.call).' };
    }
    const guardErr = family.guard(payload);
    if (guardErr) {
        _relayStats.rideDecodeRefused++; // same door-disposition counter: they share the door
        return { ok: false, code: 'E_RIDE_DECODE', error: guardErr };
    }
    const bearer = (extra && typeof extra.bearer === 'string' && extra.bearer) ? extra.bearer : null;
    let up = null;
    for (const doorCall of family.toDoor(payload)) {
        up = await _getDoorTransport()({ bearer, body: doorCall });
        if (!up || !up.ok || typeof up.body !== 'string') {
            return { ok: false, code: 'E_RIDE_DISPATCH', error: 'the door could not be reached for ' + doorCall.tool + ' or answered nothing.' };
        }
        let parsed = null;
        try { parsed = JSON.parse(up.body); } catch (e) { parsed = null; }
        if (parsed && parsed.error) {
            return { ok: false, code: 'E_RIDE_DISPATCH', error: 'the door refused ' + doorCall.tool + ': ' + (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)) };
        }
    }
    let answer = null;
    try { answer = JSON.parse(up.body); } catch (e) { answer = up.body; }
    return { ok: true, rode: true, family: event, answer };
}

// ---- mount / unmount (the POSTURE, called from the boot) ------------------

let _mounted = null;   // { registered, subscriptions: [handler…] } | null

function relayStatus() {
    const cfg = _relayConfig();
    return {
        contract: RELAY_CONTRACT,
        flavor: 'headless-pod-relay',
        enabled: cfg.enabled,
        mounted: !!_mounted,
        gateReady: !!cfg.gateKey,
        channelReady: !!cfg.channelKey,
        allowPrivate: cfg.allowPrivate,
        intranet: cfg.intranet,
        route: 'POST /' + RELAY_ROUTE,
        events: [RELAY_EVENT_HOP, RELAY_EVENT_RIDE],
        stats: { ..._relayStats }
    };
}

/**
 * Idempotent mount from the boot (vant.startFull / startHeadless) when
 * relay.enabled is ON with a gate key. Registers the webhook route (the
 * HMAC secret IS the gate) + subscribes the two dispatch handlers + starts
 * the webhook server on its configured port. Mount without posture is a
 * no-op (OFF is first-class).
 */
function relayMount(opts = {}) {
    const cfg = _relayConfig();
    if (!cfg.enabled) return relayStatus();
    if (!cfg.gateKey) {
        // fail-closed: the posture is ON but no gate secret — nothing binds
        return relayStatus();
    }
    if (_mounted) return relayStatus();
    const webhooks = require('./webhooks');
    // (pass 236 live-fire) The dispatch is the route's AWAITED hook: the
    // plain event.emit fires handlers without awaiting promises, so an
    // async relay hop/ride completed AFTER the ack - the sender never got
    // the reply. The hook runs before the ack; the event.emit stays as
    // the system-wide OBSERVABILITY feed (never dispatches - no double
    // hops).
    const webhooksEvent = require('./event');
    const dispatchHook = async (body) => {
        const ds = { dispatched: 0 };
        if (!body || typeof body !== 'object') {
            return { ok: false, code: 'E_RELAY_UNKNOWN_EVENT', error: 'the relay route expects a JSON envelope.' };
        }
        if (body.event === RELAY_EVENT_HOP) await _dispatchHop({ body, _dispatchState: ds });
        else if (body.event === RELAY_EVENT_RIDE) await _dispatchRide({ body, _dispatchState: ds });
        else if (body.event === 'relay.sync' || body.event === 'relay.lost' || body.event === 'relay.call') {
            ds.reply = await _dispatchBridge(body.event, body.payload, { bearer: (body.payload && body.payload.bearer) });
        }
        else return { ok: false, code: 'E_RELAY_UNKNOWN_EVENT', error: 'unknown relay event (relay.hop | relay.ride | relay.sync | relay.lost | relay.call).' };
        return ds.reply;
    };
    webhooks.register({
        name: RELAY_ROUTE,
        source: RELAY_SOURCE,
        eventKeyExpr: 'event',
        signatureHeader: RELAY_SIGNATURE_HEADER,
        secret: cfg.gateKey,
        replyCapable: true,
        dispatch: dispatchHook
    });
    const unknownHandler = () => { /* observability only - dispatch is the awaited hook */ };
    webhooksEvent.on('webhook:' + RELAY_EVENT_HOP, unknownHandler);
    webhooksEvent.on('webhook:' + RELAY_EVENT_RIDE, unknownHandler);
    _mounted = { subscriptions: [unknownHandler, unknownHandler] };
    // webhook transport's own port/bind posture; tests pin port via opts
    const server = webhooks.startServer(typeof opts.port === 'number' ? opts.port : undefined);
    _mounted.server = server;
    _rEmit('relay:mounted', { route: 'POST /' + RELAY_ROUTE, contract: RELAY_CONTRACT, timestamp: Date.now() });
    return relayStatus();
}

/** Unmount (test seam / posture flip): drop subscriptions + close the
 * webhook server (a posture flip is a restart in production; this seam
 * exists for the fresh suite to come up and go down cleanly). */
async function relayUnmount() {
    if (!_mounted) return;
    const event = require('./event');
    event.off && event.off('webhook:' + RELAY_EVENT_HOP, _mounted.subscriptions[0]);
    event.off && event.off('webhook:' + RELAY_EVENT_RIDE, _mounted.subscriptions[1]);
    const server = _mounted.server;
    _mounted = null;
    if (server && typeof server.close === 'function') {
        await new Promise((resolve) => server.close(() => resolve()));
    }
}

// ---- the CLIENT seam: send an envelope THROUGH a relay (any client) -------
/**
 * Compose the crew-shaped r/2 envelope, HMAC-sign the raw bytes, post to a
 * relay's webhook route, return the merged ack. This is the function the
 * dashboard edge / CLI / tests bind to — the sender-side of the wire.
 *
 * @param {string} relayUrl - relay intake root, e.g. http://127.0.0.1:3467
 * @param {string} gateKey  - the RELAY's gate secret (shared at pairing)
 * @param {object} payload  - { origin, path, ct } (hop) or { ct } (ride)
 * @param {{event?: 'relay.hop'|'relay.ride', from?: string, timeout?: number}} opts
 */
async function relaySend(relayUrl, gateKey, payload, opts = {}) {
    if (typeof gateKey !== 'string' || gateKey.length < 16) {
        throw new rErrors.VantError('E_RELAY_GATE_REQUIRED: relaySend needs the relay gate secret (>= 16 chars) - signed envelopes only, no anonymous hops',
            { code: 'E_RELAY_GATE_REQUIRED', statusCode: 400, retryable: false });
    }
    const Encrypt = require('./encrypt').default;
    const network = require('./network');
    const eventName = opts.event || 'relay.hop';
    const envelope = {
        event: eventName,
        from: opts.from || 'vant-client',
        ts: Date.now(),
        nonce: (require('crypto').randomBytes(16).toString('hex')),
        payload,
        v: { major: RELAY_WIRE_MAJOR }
    };
    const raw = JSON.stringify(envelope);
    const url = String(relayUrl || '').replace(/\/+$/, '') + '/' + RELAY_ROUTE;
    const data = await network.fetch(url, {
        method: 'POST',
        body: raw,
        headers: { 'content-type': 'application/json', [RELAY_SIGNATURE_HEADER]: Encrypt.hmacSign(raw, gateKey) },
        timeout: typeof opts.timeout === 'number' ? opts.timeout : RELAY_HOP_TIMEOUT_MS,
        circuit: true,
        system: true,
        cache: false,
        // loopback/private relays (lab) ride the explicit escape; the
        // default stays the transport's full DNS/private-IP posture
        skipDomainCheck: opts.insecure === true
    });
    let ack = null;
    try { ack = JSON.parse(data); } catch (e) { ack = { received: false, rawError: String(data).slice(0, 200) }; }
    return { ok: !!(ack && ack.received), reply: (ack && ack.reply !== undefined) ? ack.reply : null, ack };
}

// rd helper retired with the rewired byte accounting above
const relay = {
    // contract + truth
    CONTRACT: RELAY_CONTRACT, ROUTE: RELAY_ROUTE, EVENT_HOP: RELAY_EVENT_HOP,
    EVENT_RIDE: RELAY_EVENT_RIDE, WIRE_MAJOR: RELAY_WIRE_MAJOR,
    EVENT_TRAVEL: RELAY_EVENT_TRAVEL, TRAVEL_VERSION: RELAY_TRAVEL_VERSION,
    TRAVEL_KNOWN: RELAY_TRAVEL_KNOWN, TRAVEL_SHAPE_LAW: _travelerShapeRel,
    ENVELOPE_RE_SOURCE: '^[0-9a-f]{32}:[0-9a-f]{24,32}:[0-9a-f]{32}:[0-9a-f]{2,}$',
    RIDE_NONCE_TTL_MS, RIDE_NONCE_CAP,
    status: relayStatus,
    mount: relayMount,
    unmount: relayUnmount,
    // the interface-handler bridge (pass 237)
    BRIDGE_FAMILIES: RELAY_BRIDGE_FAMILIES ? Object.keys(RELAY_BRIDGE_FAMILIES) : [],
    dispatchBridge: _dispatchBridge,
    // the mount options surface (port pin for isolated tests)
    _mountOptsDefaults: {},
    envelope: relayEnvelope,
    openEnvelope: relayOpenEnvelope,
    send: relaySend,
    // dispatch handlers (exported for the fresh suite + MCP relay_status tool)
    _dispatchHop, _dispatchRide, dispatchHop: _dispatchHop, dispatchRide: _dispatchRide,
    // door seam
    setDoorTransport: setDoorTransport,
    _loopbackDoorTransport,
    _setMountedState: (v) => { _mounted = v; },
    _getMountedState: () => _mounted,
    // documented seams
    _stats: () => _relayStats,
    _resetStats: () => { for (const k of Object.keys(_relayStats)) _relayStats[k] = 0; _relayStats.startedAt = Date.now(); },
    _resetNonces: () => { _relayNonces.clear(); }
};
module.exports.relay = relay;
module.exports.relayStatus = function relayStatusShortcut() { return relayStatus(); };
// (pass 270) the origin-policy resolver, exposed for the policy pins
module.exports._relayOriginPolicy = _relayOriginPolicy;
