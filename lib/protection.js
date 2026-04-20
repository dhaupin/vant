/**
 * Vant MCP Protection
 * 
 * All-in-one protection layer for MCP server:
 * - Concurrent request limit
 * - Request timeouts
 * - Input size limits
 * - Circuit breaker
 */

const fs = require('fs');
const path = require('path');

/**
 * CONCURRENT REQUEST LIMIT
 * Max simultaneous requests to prevent fork bombs
 */
const MAX_CONCURRENT = 3;
let activeRequests = 0;

function getActiveCount() {
    return activeRequests;
}

function canProceed() {
    return activeRequests < MAX_CONCREMENT;
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
const DEFAULT_TIMEOUT_MS = 30000; // 30s default

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
const MAX_INPUT_SIZE = 1024 * 1024; // 1MB

function getMaxInputSize() {
    return MAX_INPUT_SIZE;
}

function checkInputSize(content) {
    if (content && Buffer.byteLength(content, 'utf8') > MAX_INPUT_SIZE) {
        throw new Error('Input too large: max ' + MAX_INPUT_SIZE + ' bytes');
    }
}

/**
 * CIRCUIT BREAKER
 * Fail fast if too many failures
 */
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60000; // 1 minute
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