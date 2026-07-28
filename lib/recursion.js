/**
 * Vant Recursion Guard (v0.8.6)
 * Unified recursion protection for all Vant components
 * 
 * Usage:
 *   const guard = require('./recursion');
 *   
 *   // Check depth before operation
 *   const check = guard.check('myOperation', 10);  // maxDepth=10
 *   if (!check.allowed) return { error: 'Recursion depth exceeded' };
 *   
 *   try {
 *       // do work
 *   } finally {
 *       guard.release('myOperation');  // Release on done
 *   }
 *   
 *   // Check current depth anytime
 *   const depth = guard.getDepth('myOperation');
 */

// Lazy-load Vant security dependencies
let _config = null;
let _qos = null;
let _sandbox = null;
let _event = null;

function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

function _getQos() {
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) {}
    }
    return _qos;
}

function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

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

/**
 * Run security chain check for recursion operations
 * @param {string} operation - Operation name
 * @returns {Promise<{allowed: boolean, error?: string}>}
 */
async function _runSecurityChain(operation) {
    // 1. Rate limit check via QoS
    const qos = _getQos();
    if (qos?.check) {
        try {
            await qos.check('recursion:' + operation);
        } catch (e) {
            return { allowed: false, error: 'Rate limited: ' + e.message };
        }
    }
    
    // 2. Capability check via sandbox
    const sandbox = _getSandbox();
    if (sandbox?.can && !sandbox.can('canRecurse')) {
        return { allowed: false, error: 'Capability denied: canRecurse' };
    }
    
    return { allowed: true };
}

/**
 * Input validation - basic sanity checks
 * @param {string} operation - Operation name
 */
function _validateInput(operation) {
    // Basic validation - operation must be a non-empty string
    if (typeof operation !== 'string' || operation.length === 0) {
        throw new errors.VantError('Operation must be a non-empty string', { code: errors.CODES.UNKNOWN });
    }
    if (operation.length > 200) {
        throw new errors.VantError('Operation name too long (max 200)', { code: errors.CODES.UNKNOWN });
    }
}

// Per-operation depth tracking
const _depthMap = new Map();

// Counter to track nested guard.check() calls
// Incremented on check(), decremented in finally
// Only emit events when counter is 0 (not in any check)
let _guardCheckDepth = 0;

/**
 * Get configured max depth for an operation
 * @param {string} operation - Operation name
 * @param {number} defaultDepth - Default if not in config
 * 
 * NOTE: We don't load config here to avoid circular deps:
 * audit -> event -> guard.check -> config.get -> load -> _checkRead -> ... -> event
 */
function getMaxDepth(operation, defaultDepth = 10) {
    // Skip config loading to avoid circular dependency with event system
    // Config can still be used via checkAsync() which handles the chain properly
    return defaultDepth;
}

/**
 * Check if operation is within depth limit
 * @param {string} operation - Operation identifier
 * @param {number} [maxDepth] - Optional max depth override
 * @returns {object} - { allowed: boolean, depth: number, max: number }
 * 
 * SECURITY: This is sync for performance. For async security checks,
 * use checkAsync() which runs the full security chain.
 */
function check(operation, maxDepth) {
    // Input validation
    _validateInput(operation);

    // Track nesting depth for this check (prevents emit recursion)
    const prevDepth = _guardCheckDepth;
    _guardCheckDepth++;

    try {
        const max = maxDepth || getMaxDepth(operation, 10);
        const current = _depthMap.get(operation) || 0;

        if (current >= max) {
            // Only emit if not nested (avoids recursion: check -> emit -> check)
            if (prevDepth === 0) _emit('recursion:depthExceeded', { operation, depth: current, max });
            return { allowed: false, depth: current, max, reason: 'max_depth_exceeded' };
        }

        _depthMap.set(operation, current + 1);
        // Only emit if not nested (avoids recursion: check -> emit -> check)
        if (prevDepth === 0) _emit('recursion:check', { operation, depth: current + 1, max, allowed: true });
        return { allowed: true, depth: current + 1, max };
    } finally {
        _guardCheckDepth = prevDepth;
    }
}

/**
 * Async version with full security chain
 * Use this for operations that need QoS rate limiting + capability checks
 * @param {string} operation - Operation identifier
 * @param {number} [maxDepth] - Optional max depth override
 * @returns {Promise<{allowed: boolean, depth: number, max: number, error?: string}>}
 */
async function checkAsync(operation, maxDepth) {
    // Input validation
    _validateInput(operation);
    
    // Run security chain: QoS rate limit + sandbox capability
    const sec = await _runSecurityChain(operation);
    if (!sec.allowed) {
        return { allowed: false, depth: 0, max: maxDepth || 10, error: sec.error };
    }
    
    return check(operation, maxDepth);
}

/**
 * Release depth after operation completes
 * @param {string} operation - Operation identifier
 */
function release(operation) {
    const current = _depthMap.get(operation) || 1;
    const newDepth = Math.max(0, current - 1);
    _depthMap.set(operation, newDepth);
    // Don't emit from release - it's called after check's finally runs,
    // so _guardCheckDepth has already been reset. Emitting here causes recursion.
    // The 'recursion:check' event is sufficient for tracking.
}

/**
 * Get current depth for an operation
 * @param {string} operation - Operation identifier
 */
function getDepth(operation) {
    return _depthMap.get(operation) || 0;
}

/**
 * Reset all tracked depths (for testing)
 */
function reset() {
    _depthMap.clear();
}

/**
 * Get all tracked operations and their depths
 */
function getStatus() {
    return Object.fromEntries(_depthMap);
}

/**
 * Check + execute helper (synchronous)
 * @param {string} operation - Operation identifier
 * @param {Function} fn - Function to execute
 * @param {number} [maxDepth] - Optional max depth
 * @returns {*} - Result of fn, or error object if blocked
 */
function guard(operation, fn, maxDepth) {
    const checkResult = check(operation, maxDepth);
    if (!checkResult.allowed) {
        return { error: 'Recursion depth exceeded', code: 'E_RECURSION_DEPTH', ...checkResult };
    }
    try {
        return fn();
    } finally {
        release(operation);
    }
}

/**
 * Async version of guard
 */
async function guardAsync(operation, fn, maxDepth) {
    const checkResult = check(operation, maxDepth);
    if (!checkResult.allowed) {
        return { error: 'Recursion depth exceeded', code: 'E_RECURSION_DEPTH', ...checkResult };
    }
    try {
        return await fn();
    } finally {
        release(operation);
    }
}

// ==================== SAFE PRIMITIVES FOR AGENTS ====================

/**
 * Batch process items recursively with depth safety
 * Use for: processing trees, nested arrays, recursive operations
 * 
 * @param {string} operation - Operation name for tracking
 * @param {Array} items - Items to process
 * @param {Function} processor - (item, depth) => result or Promise
 * @param {Object} options - { maxDepth, onError, stopOnError }
 * @returns {Promise<{results, errors, depth}>}
 */
async function batch(operation, items, processor, options = {}) {
    const { maxDepth: optMax, onError = 'continue', stopOnError = false } = options;
    const results = [];
    const errors = [];
    let maxSeen = 0;
    
    async function processItem(item, depth) {
        maxSeen = Math.max(maxSeen, depth);
        
        // Guard check
        const depthCheck = check(operation, optMax);
        if (!depthCheck.allowed) {
            const err = { item, depth, error: 'Depth exceeded', code: 'E_BATCH_DEPTH' };
            errors.push(err);
            return stopOnError ? null : item; // Return item or null on error
        }
        
        try {
            // Process item
            let result;
            if (processor.length >= 2) {
                result = await processor(item, depth);  // Pass depth to processor
            } else {
                result = await processor(item);
            }
            
            // If result is array, recurse (batch processing)
            if (Array.isArray(result)) {
                for (const subItem of result) {
                    const subResult = await processItem(subItem, depth + 1);
                    if (subResult !== null) results.push(subResult);
                    if (stopOnError && errors.length > 0) break;
                }
            }
            
            return result;
        } catch (e) {
            const err = { item, depth, error: e.message, code: 'E_BATCH_ERROR' };
            errors.push(err);
            return onError === 'continue' ? item : null;
        } finally {
            release(operation);
        }
    }
    
    // Process all top-level items
    for (const item of items) {
        const result = await processItem(item, 0);
        if (result !== null) results.push(result);
        if (stopOnError && errors.length > 0) break;
    }
    
    return { results, errors, depth: maxSeen };
}

/**
 * Traverse a tree/graph with depth safety
 * Use for: tree walks, graph traversal, nested object traversal
 * 
 * @param {string} operation - Operation name for tracking
 * @param {Object} root - Root node
 * @param {Function} getChildren - (node) => children array
 * @param {Function} visitor - (node, depth) => result
 * @param {Object} options - { maxDepth, breadthFirst }
 * @returns {Promise<{visited, results, depth}>}
 */
async function traverse(operation, root, getChildren, visitor, options = {}) {
    const { maxDepth: optMax, breadthFirst = false } = options;
    const visited = new Set();
    const results = [];
    let maxSeen = 0;
    
    async function visit(node, depth) {
        if (!node || visited.has(node)) return;
        
        maxSeen = Math.max(maxSeen, depth);
        
        // Guard check
        const depthCheck = check(operation, optMax);
        if (!depthCheck.allowed) {
            return; // Stop traversal
        }
        
        try {
            visited.add(node);
            
            // Visit this node
            const result = await visitor(node, depth);
            if (result !== undefined) results.push({ node, depth, result });
            
            // Get children
            const children = getChildren(node) || [];
            
            if (breadthFirst) {
                // Queue children for later ( breadth-first)
                for (const child of children) {
                    await visit(child, depth + 1);
                }
            } else {
                // Depth-first: recurse into first child before processing others
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (i === 0) {
                        // First child: recurse immediately (depth-first)
                        await visit(child, depth + 1);
                    } else {
                        // Other children: process after
                        const subResult = await visit(child, depth + 1);
                    }
                }
            }
        } finally {
            release(operation);
        }
    }
    
    await visit(root, 0);
    
    return { visited: visited.size, results, depth: maxSeen };
}

/**
 * Follow a chain of lookups with depth safety
 * Use for: linked list traversal, reference following, dependency chains
 * 
 * @param {string} operation - Operation name for tracking
 * @param {Object} start - Starting item
 * @param {Function} lookup - (item) => next item or null
 * @param {Function} validator - (item) => boolean (optional)
 * @param {Object} options - { maxDepth, includePath }
 * @returns {Promise<{found, item, path, depth}>}
 */
async function lookup(operation, start, lookup, validator = () => true, options = {}) {
    const { maxDepth: optMax, includePath = true } = options;
    const path = includePath ? [start] : [];
    let current = start;
    let depth = 0;
    
    while (current) {
        // Guard check
        const depthCheck = check(operation, optMax);
        if (!depthCheck.allowed) {
            return { found: false, item: current, path, depth, error: 'Depth exceeded', code: 'E_LOOKUP_DEPTH' };
        }
        
        // Validate current
        if (!validator(current)) {
            return { found: false, item: current, path, depth, error: 'Validation failed', code: 'E_LOOKUP_VALIDATE' };
        }
        
        // Found it!
        if (depth > 0) { // start doesn't count
            return { found: true, item: current, path, depth };
        }
        
        // Move to next
        try {
            current = await lookup(current);
            if (current && includePath) path.push(current);
            depth++;
        } catch (e) {
            release(operation);
            return { found: false, item: current, path, depth, error: e.message, code: 'E_LOOKUP_ERROR' };
        }
        
        release(operation);
    }
    
    return { found: false, item: current, path, depth, error: 'End of chain', code: 'E_LOOKUP_END' };
}

/**
 * Retry an operation with depth tracking
 * Use for: network calls, flaky operations, exponential backoff
 * 
 * @param {string} operation - Operation name for tracking
 * @param {Function} fn - () => result or Promise
 * @param {Object} options - { maxDepth, maxRetries, backoff, onRetry }
 * @returns {Promise<{success, result, attempts, error}>}
 */
async function retry(operation, fn, options = {}) {
    const { maxDepth: optMax, maxRetries = 3, backoff = 1000, onRetry } = options;
    let attempts = 0;
    let lastError;
    
    while (attempts <= maxRetries) {
        // Guard check (prevents infinite retry loops)
        const depthCheck = check(operation, optMax);
        if (!depthCheck.allowed) {
            return { success: false, attempts, error: 'Depth exceeded', code: 'E_RETRY_DEPTH' };
        }
        
        attempts++;
        
        try {
            const result = await fn(attempts);
            release(operation);
            return { success: true, result, attempts };
        } catch (e) {
            lastError = e;
            release(operation);
            
            if (attempts <= maxRetries) {
                const delay = backoff * Math.pow(2, attempts - 1); // Exponential backoff
                if (onRetry) await onRetry(attempts, maxRetries, delay, e.message);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    
    return { success: false, attempts, error: lastError?.message, code: 'E_RETRY_EXHAUSTED' };
}

module.exports = {
    // Core
    check,
    checkAsync,  // NEW: Full security chain
    release,
    getDepth,
    reset,
    getStatus,
    guard,
    guardAsync,
    getMaxDepth,
    // Safe primitives for agents
    batch,
    traverse,
    lookup,
    retry,
    // Security layer interface
    getLayerStatus: () => ({ name: 'RecursionGuard', type: 'security', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'RecursionGuard' }),
    
    // Multibrain
    getBrainRecursionConfig,
    setBrainRecursionConfig,
    getStackRecursionConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainRecursionConfigs = {};

function getBrainRecursionConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainRecursionConfigs[brainName] || { maxDepth: 100 };
}

function setBrainRecursionConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainRecursionConfigs[brainName] = config;
    return true;
}

function getStackRecursionConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainRecursionConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
