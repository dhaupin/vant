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

// Lazy-load config
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

// Per-operation depth tracking
const _depthMap = new Map();

/**
 * Get configured max depth for an operation
 * @param {string} operation - Operation name
 * @param {number} defaultDepth - Default if not in config
 */
function getMaxDepth(operation, defaultDepth = 10) {
    const cfg = _getConfig();
    // Allow per-operation config: recursion.maxDepth.{operation}
    if (cfg && cfg.get) {
        return cfg.get('recursion.maxDepth.' + operation, 
               cfg.get('recursion.maxDepth', defaultDepth));
    }
    return defaultDepth;
}

/**
 * Check if operation is within depth limit
 * @param {string} operation - Operation identifier
 * @param {number} [maxDepth] - Optional max depth override
 * @returns {object} - { allowed: boolean, depth: number, max: number }
 */
function check(operation, maxDepth) {
    const max = maxDepth || getMaxDepth(operation, 10);
    const current = _depthMap.get(operation) || 0;
    
    if (current >= max) {
        return { allowed: false, depth: current, max, reason: 'max_depth_exceeded' };
    }
    
    _depthMap.set(operation, current + 1);
    return { allowed: true, depth: current + 1, max };
}

/**
 * Release depth after operation completes
 * @param {string} operation - Operation identifier
 */
function release(operation) {
    const current = _depthMap.get(operation) || 1;
    _depthMap.set(operation, Math.max(0, current - 1));
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

module.exports = {
    check,
    release,
    getDepth,
    reset,
    getStatus,
    guard,
    guardAsync,
    getMaxDepth,
    getLayerStatus: () => ({ name: 'RecursionGuard', type: 'security', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true, layer: 'RecursionGuard' })
};
