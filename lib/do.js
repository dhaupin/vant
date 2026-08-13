/**
 * do.js - The Entry Abstraction Layer
 * 
 * A universal function handler that provides:
 * - Sync/async unification
 * - Mode selection (PUBLIC, PRIVATE, DUAL)
 * - Fallback chaining
 * - Extensibility hooks
 * 
 * "Just do" - don't worry about how to call things safely.
 */

const pipeline = require('./pipeline');

// Mode constants (from pipeline.js)
const PUBLIC = pipeline.PUBLIC;
const PRIVATE = pipeline.PRIVATE;
const DUAL = pipeline.DUAL;

// Registry for operations and hooks
const _registry = {
    operations: new Map(),  // operation name -> schema
    adapters: new Map(),     // adapter name -> adapter impl
    hooks: new Map(),        // hook name -> [callbacks]
};

// ==================== CORE do() FUNCTION ====================

/**
 * Execute a function through the pipeline with unified sync/async handling
 * 
 * @param {string} operation - Operation name (e.g., 'brain:load', 'skills:get')
 * @param {object} context - Context data for the operation
 * @param {string} mode - Mode: PUBLIC, PRIVATE, or DUAL
 * @param {function} fn - The function to execute
 * @returns {any} Result from the function
 */
async function _do(operation, context = {}, mode = PUBLIC, fn) {
    return pipeline.run(
        { name: operation, ...context },
        async () => _executeFn(fn),
        { mode: mode || PUBLIC }
    );
}

// ==================== MODE SHORTHANDS ====================

/**
 * Execute in PUBLIC mode (read-only, no auth needed)
 */
_do.public = function(operation, context, fn) {
    return _do(operation, context, PUBLIC, fn);
};

/**
 * Execute in PRIVATE mode (write operations, agent-specific)
 */
_do.private = function(operation, context, fn) {
    return _do(operation, context, PRIVATE, fn);
};

/**
 * Execute in DUAL mode (public + private merged)
 */
_do.dual = function(operation, context, fn) {
    return _do(operation, context, DUAL, fn);
};

// ==================== SYNC/ASYNC HANDLING ====================

/**
 * Execute a function, auto-detecting sync vs async
 * Doesn't go through pipeline - just handles execution style
 * 
 * @param {function} fn - Function to execute (sync or async)
 * @param {any} ...args - Arguments to pass to function
 * @returns {any} Result, promise, or sync result
 */
function _executeFn(fn) {
    if (typeof fn !== 'function') {
        throw new Error('do.js: fn must be a function');
    }
    
    // Get arguments except the first (fn)
    const args = Array.prototype.slice.call(arguments, 1);
    
    // Try to detect if function is sync or async by trying to call it
    try {
        const result = fn.apply(null, args);
        
        // If it returns a promise, it's async
        if (result && typeof result.then === 'function') {
            return result;
        }
        
        // It's sync - return directly
        return result;
    } catch (e) {
        // Sync function threw - rethrow
        throw e;
    }
}

/**
 * Wrap a sync function to work in async context
 * Useful when you need to call sync functions through do()
 * 
 * @param {function} syncFn - Sync function to wrap
 * @returns {function} Wrapped function that returns Promise
 */
_do.sync = function(syncFn) {
    return function(...args) {
        return Promise.resolve().then(() => {
            return syncFn.apply(null, args);
        });
    };
};

/**
 * Wrap an async function to ensure it returns a Promise
 * 
 * @param {function} asyncFn - Async function to wrap
 * @returns {function} Wrapped function that returns Promise
 */
_do.async = function(asyncFn) {
    return function(...args) {
        return Promise.resolve().then(() => {
            return asyncFn.apply(null, args);
        });
    };
};

// ==================== FALLBACK CHAINING ====================

/**
 * Try each function in order until one succeeds
 * 
 * @param {...function} fns - Functions to try in order
 * @returns {any} Result from first successful function
 */
_do.fallback = function(...fns) {
    return _fallbackChain(fns, 0);
};

async function _fallbackChain(fns, index) {
    if (index >= fns.length) {
        throw new Error('do.js: All fallback functions failed');
    }
    
    const fn = fns[index];
    
    try {
        const result = _executeFn(fn);
        if (result && typeof result.then === 'function') {
            return await result;
        }
        return result;
    } catch (e) {
        // Try next function in chain
        return _fallbackChain(fns, index + 1);
    }
}

/**
 * Try function with pipeline, fall back to direct call if fails
 * 
 * @param {string} operation - Operation name
 * @param {object} context - Context
 * @param {string} mode - Pipeline mode
 * @param {function} pipelineFn - Function to try through pipeline
 * @param {function} fallbackFn - Function to try if pipeline fails
 * @returns {any} Result
 */
_do.try = async function(operation, context, mode, pipelineFn, fallbackFn) {
    try {
        return await _do(operation, context, mode, pipelineFn);
    } catch (e) {
        // Fall back to direct call
        return _executeFn(fallbackFn);
    }
};

// ==================== DISCOVERY ====================

/**
 * Register an operation with its schema
 * 
 * @param {string} name - Operation name (e.g., 'brain:load')
 * @param {object} schema - Schema defining inputs/outputs
 */
_do.register = function(name, schema = {}) {
    _registry.operations.set(name, {
        name,
        schema,
        registeredAt: Date.now()
    });
};

/**
 * List all registered operations
 * 
 * @returns {array} List of operation names
 */
_do.list = function() {
    return Array.from(_registry.operations.keys());
};

/**
 * Get schema for an operation
 * 
 * @param {string} name - Operation name
 * @returns {object|null} Operation schema or null if not found
 */
_do.schema = function(name) {
    return _registry.operations.get(name) || null;
};

/**
 * Get full manifest of all operations
 * 
 * @returns {object} All registered operations and their schemas
 */
_do.manifest = function() {
    const manifest = {};
    for (const [name, op] of _registry.operations) {
        manifest[name] = op.schema;
    }
    return manifest;
};

// ==================== ADAPTERS ====================

/**
 * Register an adapter
 * 
 * @param {string} name - Adapter name (e.g., 'storage', 'embed')
 * @param {object} adapter - Adapter implementation
 */
_do.adapter = function(name, adapter) {
    _registry.adapters.set(name, adapter);
};

/**
 * Get a registered adapter
 * 
 * @param {string} name - Adapter name
 * @returns {object|null} Adapter or null if not found
 */
_do.getAdapter = function(name) {
    return _registry.adapters.get(name) || null;
};

/**
 * List all registered adapters
 * 
 * @returns {array} List of adapter names
 */
_do.adapters = function() {
    return Array.from(_registry.adapters.keys());
};

// ==================== HOOKS ====================

/**
 * Register a hook callback
 * 
 * @param {string} event - Event name (e.g., 'before:read', 'after:write')
 * @param {function} callback - Callback function
 */
_do.hook = function(event, callback) {
    if (!_registry.hooks.has(event)) {
        _registry.hooks.set(event, []);
    }
    _registry.hooks.get(event).push(callback);
};

/**
 * Emit a hook event
 * 
 * @param {string} event - Event name
 * @param {any} data - Data to pass to hook callbacks
 * @returns {array} Results from all hook callbacks
 */
_do.emit = async function(event, data) {
    const callbacks = _registry.hooks.get(event) || [];
    const results = [];
    
    for (const callback of callbacks) {
        try {
            const result = callback(data);
            if (result && typeof result.then === 'function') {
                results.push(await result);
            } else {
                results.push(result);
            }
        } catch (e) {
            // Log hook error but don't fail
            results.push({ error: e.message });
        }
    }
    
    return results;
};

/**
 * Remove a hook callback
 * 
 * @param {string} event - Event name
 * @param {function} callback - Callback to remove
 */
_do.unhook = function(event, callback) {
    const callbacks = _registry.hooks.get(event) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
        callbacks.splice(index, 1);
    }
};

// ==================== CONFIG ====================

/**
 * Get/do configuration
 */
_do.config = function(key, value) {
    // Placeholder for future config system
    // Could integrate with config.js
    return { key, value };
};

// ==================== EXPORTS ====================

module.exports = _do;

// Also export constants for convenience
_do.PUBLIC = PUBLIC;
_do.PRIVATE = PRIVATE;
_do.DUAL = DUAL;
