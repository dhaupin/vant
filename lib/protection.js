/**
 * Vant MCP Protection
 * 
 * All-in-one protection layer for MCP server:
 * - Concurrent request limit
 * - Request timeouts
 * - Input size limits
 * - Circuit breaker
 * 
 * Settings can be configured via config.ini (see config.example.ini)
 * or environment variables (MCP_TIMEOUT, MCP_MAX_INPUT_SIZE, etc.)
 */

const fs = require('fs');
const path = require('path');

// Try to load config for security settings
let configModule = null;
try {
    configModule = require('./config');
} catch (e) {
    // Config not available, use defaults
}

/**
 * Get config value with fallback
 */
function getConfig(key, defaultValue, parseFn = String) {
    if (configModule) {
        const val = configModule.get(key);
        if (val !== undefined && val !== '') {
            return parseFn(val);
        }
    }
    // Check environment variable
    const envKey = 'MCP_' + key.replace(/_/g, '_').toUpperCase();
    if (process.env[envKey]) {
        return parseFn(process.env[envKey]);
    }
    return defaultValue;
}

/**
 * CONCURRENT REQUEST LIMIT
 * Max simultaneous requests to prevent fork bombs
 */
const MAX_CONCURRENT = getConfig('MAX_CONCURRENT', 3, parseInt);
let activeRequests = 0;

function getActiveCount() {
    return activeRequests;
}

function canProceed() {
    return activeRequests < MAX_CONCURRENT;
}

function incrementActive() {
    activeRequests++;
}

function decrementActive() {
    activeRequests--;
}

/**
 * REQUEST TIMEOUT
 * Wrap async functions with timeout
 */
const DEFAULT_TIMEOUT_MS = getConfig('TIMEOUT', 30000, parseInt);

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout: ' + ms + 'ms')), ms)
        )
    ]);
}

/**
 * INPUT SIZE LIMIT
 * Max content size for set_memory
 */
const MAX_INPUT_SIZE = getConfig('MAX_INPUT_SIZE', 1048576, parseInt);

function getMaxInputSize() {
    return MAX_INPUT_SIZE;
}

function checkInputSize(content) {
    vaf.check(content, {type: "string", name: "content", maxLength: 100000});
    if (content && Buffer.byteLength(content, 'utf8') > MAX_INPUT_SIZE) {
        throw new Error('Input too large: max ' + MAX_INPUT_SIZE + ' bytes');
    }
}

/**
 * CIRCUIT BREAKER
 * Fail fast if too many failures
 */
const FAILURE_THRESHOLD = getConfig('CIRCUIT_BREAK_THRESHOLD', 5, parseInt);
const FAILURE_WINDOW_MS = getConfig('CIRCUIT_BREAK_WINDOW', 60000, parseInt);
let failures = [];

function recordFailure() {
    failures.push(Date.now());
    // Keep only recent failures
    failures = failures.filter(t => Date.now() - t < FAILURE_WINDOW_MS);
}

function getFailureCount() {
    // Clean old failures first
    failures = failures.filter(t => Date.now() - t < FAILURE_WINDOW_MS);
    return failures.length;
}

function isCircuitOpen() {
    return getFailureCount() >= FAILURE_THRESHOLD;
}

function getCircuitStatus() {
    return {
        open: isCircuitOpen(),
        failures: getFailureCount(),
        threshold: FAILURE_THRESHOLD,
        windowMs: FAILURE_WINDOW_MS
    };
}

function resetCircuit() {
    failures = [];
}

/**
 * GET STATUS
 * Combined status for health checks
 */
function getStatus() {
    return {
        activeRequests: getActiveCount(),
        maxConcurrent: MAX_CONCURRENT,
        circuit: getCircuitStatus(),
        maxInputSize: MAX_INPUT_SIZE,
        defaultTimeout: DEFAULT_TIMEOUT_MS
    };
}

module.exports = {
    // Concurrency
    getActiveCount,
    canProceed,
    incrementActive,
    decrementActive,
    MAX_CONCURRENT,
    
    // Timeout
    withTimeout,
    DEFAULT_TIMEOUT_MS,
    
    // Input size
    checkInputSize,
    getMaxInputSize,
    MAX_INPUT_SIZE,
    
    // Circuit breaker
    recordFailure,
    getFailureCount,
    isCircuitOpen,
    getCircuitStatus,
    resetCircuit,
    FAILURE_THRESHOLD,
    FAILURE_WINDOW_MS,
    
    // Combined
    getStatus
};