/**
 * Vant API Layer
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
 *   api.onBeforeExecute((ctx) => { console.log('before', ctx); });
 *   api.onAfterExecute((ctx) => { console.log('after', ctx); });
 * 
 *   // Mode detection
 *   console.log(api.getMode()); // 'cli' | 'mcp' | 'headless'
 */

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
 */
function detectMode() {
    // Check if running as MCP
    if (process.config.VANT_MODE === 'mcp' || process.config.VANT_MCP_PORT) {
        return 'mcp';
    }
    
    // Check if running as CLI (has stdin/stdout attached)
    if (process.stdin.isTTY || process.argv.includes('--cli')) {
        return 'cli';
    }
    
    // Check if imported as module (headless)
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
        // Authentication check
        if (this._requireAuth) {
            const secret = context.secret || (context.headers && context.headers['x-api-key']) || (context.headers && context.headers['authorization'] && context.headers['authorization'].replace('Bearer ', ''));
            const auth = this.authenticate(secret);
            if (!auth.allowed) {
                throw new Error('Unauthorized');
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
            
            // Run after hooks
            for (const hook of this._afterHooks) {
                try {
                    await hook(ctx);
                } catch(e) {
                    // Log but continue
                }
            }
            
            return result;
            
        } catch(error) {
            // Error context
            ctx.error = error;
            ctx.duration = Date.now() - startTime;
            this._errorCount++;
            
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
    call(type, operation, context) {
        return defaultApi.call(type, operation, context);
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
        if (!auth.allowed) throw new Error('Unauthorized');
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
        if (!auth.allowed) throw new Error('Unauthorized');
        defaultApi.setMode(mode);
    },
    getLayerStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.isOperationAllowed(operationType, context);
    },
    getStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.getStatus();
    },
    async init(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.init();
    },
    detectMode,
    setSecret(secret, context) {
        // Allow bootstrap - no auth needed if no secret configured yet
        const current = defaultApi.getAuthStatus();
        if (!current.secretSet) { defaultApi.setSecret(secret); return; }
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new Error('Unauthorized');
        defaultApi.setSecret(secret);
    },
    requireAuth(required, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new Error('Unauthorized');
        defaultApi.requireAuth(required);
    },
    authenticate(secret, context) {
        const key = config.apiKey(context);
        const auth = defaultApi.authenticate(key);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.authenticate(secret);
    },
    getAuthStatus(context) {
        const secret = config.apiKey(context);
        const auth = defaultApi.authenticate(secret);
        if (!auth.allowed) throw new Error('Unauthorized');
        return defaultApi.getAuthStatus();
    }
};
