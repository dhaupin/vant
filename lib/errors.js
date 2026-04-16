/**
 * Vant Errors
 * Unified error handling with codes, retry logic
 * 
 * Usage:
 *   const errors = require('./errors');
 *   throw new errors.VantError('Failed', { code: 'SYNC_FAIL' });
 *   
 *   // With retry
 *   await errors.retry(async () => await doSomething(), 3);
 */

// Logger may not be loaded yet - use console fallback
let logger;
try {
    logger = require('./logger');
} catch (e) {
    logger = {
        debug: console.log.bind(console),
        info: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
}

/**
 * Error codes
 */
const CODES = {
    // Config
    CONFIG_MISSING: 'CONFIG_MISSING',
    CONFIG_INVALID: 'CONFIG_INVALID',
    
    // GitHub
    GITHUB_AUTH: 'GITHUB_AUTH',
    GITHUB_NOT_FOUND: 'GITHUB_NOT_FOUND',
    GITHUB_RATE_LIMIT: 'GITHUB_RATE_LIMIT',
    GITHUB_SYNC_FAIL: 'GITHUB_SYNC_FAIL',
    
    // Brain
    BRAIN_LOAD_FAIL: 'BRAIN_LOAD_FAIL',
    BRAIN_SAVE_FAIL: 'BRAIN_SAVE_FAIL',
    BRAIN_VERSION_INVALID: 'BRAIN_VERSION_INVALID',
    
    // Network
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_OFFLINE: 'NETWORK_OFFLINE',
    
    // Lock
    LOCK_TIMEOUT: 'LOCK_TIMEOUT',
    LOCK_FAILED: 'LOCK_FAILED',
    
    // General
    UNKNOWN: 'UNKNOWN'
};

/**
 * Vant Error class
 */
class VantError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'VantError';
        this.code = options.code || CODES.UNKNOWN;
        this.statusCode = options.statusCode || 500;
        this.retryable = options.retryable || false;
        this.details = options.details || null;
        
        // Capture stack properly
        Error.captureStackTrace(this, VantError);
    }
    
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            retryable: this.retryable,
            details: this.details,
            stack: this.stack
        };
    }
}

/**
 * Handle error with logging
 */
function handle(error, context = '') {
    const isVantError = error instanceof VantError;
    
    const logLevel = isVantError && error.statusCode < 500 ? 'warn' : 'error';
    const prefix = context ? `[${context}] ` : '';
    
    logger[logLevel](`${prefix}${error.message}`, {
        code: isVantError ? error.code : 'UNKNOWN',
        statusCode: isVantError ? error.statusCode : 500,
        retryable: isVantError ? error.retryable : false
    });
    
    return error;
}

/**
 * Retry with exponential backoff
 */
async function retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            const isRetryable = error instanceof VantError && error.retryable;
            if (!isRetryable || i === maxRetries) {
                throw error;
            }
            
            const delay = baseDelay * Math.pow(2, i);
            logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${error.message}`);
            await sleep(delay);
        }
    }
    
    throw lastError;
}

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap async function with error handling
 */
function wrap(fn, context = '') {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw handle(error, context);
        }
    };
}

/**
 * Create specific errors quickly
 */
function configError(message, details) {
    return new VantError(message, { code: CODES.CONFIG_MISSING, retryable: false, details });
}

function githubError(message, statusCode, details) {
    const codeMap = {
        401: CODES.GITHUB_AUTH,
        404: CODES.GITHUB_NOT_FOUND,
        403: CODES.GITHUB_RATE_LIMIT
    };
    
    return new VantError(message, {
        code: codeMap[statusCode] || CODES.GITHUB_SYNC_FAIL,
        statusCode,
        retryable: statusCode === 403 || statusCode === 429,
        details
    });
}

function networkError(message, details) {
    return new VantError(message, {
        code: CODES.NETWORK_TIMEOUT,
        statusCode: 0,
        retryable: true,
        details
    });
}

module.exports = {
    VantError,
    CODES,
    handle,
    retry,
    wrap,
    configError,
    githubError,
    networkError,
    sleep
};