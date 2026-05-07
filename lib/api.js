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
const sandbox = require('./sandbox');
const qos = require('./protection');
const security = require('./security');

/**
 * API Mode detection
 */
function detectMode() {
    // Check if running as MCP
    if (process.env.VANT_MODE === 'mcp' || process.env.VANT_MCP_PORT) {
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
            // Execute through framework (lazy loaded)
            const result = await getFramework().execute(operation, {type});
            
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
    // Class for custom instances
    API,
    
    /**
     * Create API instance
     */
    create(options = {}) {
        return new API(options);
    },
    
    /**
     * Execute through default API
     */
    execute(type, operation, context) {
        return defaultApi.execute(type, operation, context);
    },
    
    /**
     * Read operation
     */
    read(operation, context) {
        return defaultApi.read(operation, context);
    },
    
    /**
     * Write operation
     */
    write(operation, context) {
        return defaultApi.write(operation, context);
    },
    
    /**
     * Call with type
     */
    call(type, operation, context) {
        return defaultApi.call(type, operation, context);
    },
    
    /**
     * Register before hook
     */
    onBeforeExecute(fn) {
        defaultApi.onBeforeExecute(fn);
    },
    
    /**
     * Register after hook
     */
    onAfterExecute(fn) {
        defaultApi.onAfterExecute(fn);
    },
    
    /**
     * Register error hook
     */
    onError(fn) {
        defaultApi.onError(fn);
    },
    
    /**
     * Get mode
     */
    getMode() {
        return defaultApi.getMode();
    },
    
    /**
     * Set mode
     */
    setMode(mode) {
        defaultApi.setMode(mode);
    },
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return defaultApi.getLayerStatus();
    },
    
    /**
     * Check operation allowed
     */
    isOperationAllowed(operationType, context) {
        return defaultApi.isOperationAllowed(operationType, context);
    },
    
    /**
     * Get status
     */
    getStatus() {
        return defaultApi.getStatus();
    },
    
    /**
     * Initialize
     */
    async init() {
        return defaultApi.init();
    },
    
    /**
     * Detect mode
     */
    detectMode
};