/**
 * Vant Errors (v0.8.6)
 * WITH EVENT EMISSIONS - error handling emits globally
 * Unified error handling with codes, retry logic
 * 
 * Usage:
 *   const errors = require('./errors');
 *   throw new errors.Error('Failed', { code: 'SYNC_FAIL' });
 *   
 *   // With retry
 *   await errors.retry(async () => await doSomething(), 3);
 */

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

// Logger may not be loaded yet - use console fallback
let logger;
let vaf;
try {
    logger = require('./audit');
    vaf = require('./vaf');
} catch (e) {
    logger = {
        debug: console.log.bind(console),
        info: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
    vaf = {
        check: () => {},
        checkContent: () => ({blocked: false}),
        checkPathTraversal: () => ({blocked: false})
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
    
    // Stego
    STEGO_ENCODE_FAIL: 'STEGO_ENCODE_FAIL',
    STEGO_DECODE_FAIL: 'STEGO_DECODE_FAIL',
    STEGO_INVALID_PNG: 'STEGO_INVALID_PNG',
    STEGO_MESSAGE_TOO_LONG: 'STEGO_MESSAGE_TOO_LONG',
    DECRYPT_FAIL: 'DECRYPT_FAIL',
    
    // General
    UNKNOWN: 'UNKNOWN'
};

/**
 * Vant Error class
 */
class VantError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'Error';
        this.code = options.code || CODES.UNKNOWN;
        this.statusCode = options.statusCode || 500;
        this.retryable = options.retryable || false;
        this.details = options.details || null;
        
        // Capture stack properly
        Error.captureStackTrace(this, Error);
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
    vaf.check(error.message || String(error), {type: "string", name: "error", maxLength: 1000});
    const isError = error instanceof Error;
    
    const logLevel = isError && error.statusCode < 500 ? 'warn' : 'error';
    const prefix = context ? `[${context}] ` : '';
    
    logger[logLevel](`${prefix}${error.message}`, {
        code: isError ? error.code : 'UNKNOWN',
        statusCode: isError ? error.statusCode : 500,
        retryable: isError ? error.retryable : false
    });
    
    return error;
}

/**
 * Retry with exponential backoff
 */
async function retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    // EVENT: retry starting
    _emit('error:retry', { timestamp: Date.now() });
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            const isRetryable = error instanceof Error && error.retryable;
            if (!isRetryable || i === maxRetries) {
                _emit('error:exhausted', { message: error.message, timestamp: Date.now() });
                throw error;
            }
            
            const delay = baseDelay * Math.pow(2, i);
            audit.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${error.message}`);
            
            _emit('error:retry:attempt', { attempt: i + 1, delay, timestamp: Date.now() });
            
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
    return new Error(message, { code: CODES.CONFIG_MISSING, retryable: false, details });
}

function githubError(message, statusCode, details) {
    const codeMap = {
        401: CODES.GITHUB_AUTH,
        404: CODES.GITHUB_NOT_FOUND,
        403: CODES.GITHUB_RATE_LIMIT
    };
    
    return new Error(message, {
        code: codeMap[statusCode] || CODES.GITHUB_SYNC_FAIL,
        statusCode,
        retryable: statusCode === 403 || statusCode === 429,
        details
    });
}

function networkError(message, details) {
    return new Error(message, {
        code: CODES.NETWORK_TIMEOUT,
        statusCode: 0,
        retryable: true,
        details
    });
}

module.exports = {
    Error,
    CODES,
    handle,
    retry,
    wrap,
    configError,
    githubError,
    networkError,
    sleep
};
// ==================== ERROR HANDLER ====================
class ErrorHandler {
    constructor(options = {}) {
        this.options = { showErrors: options.showErrors || false, logErrors: options.logErrors || true };
        this._handlers = new Map();
        this._handlers.set(404, (req) => ({ status: 404, message: 'Not Found' }));
        this._handlers.set(500, (req, e) => ({ status: 500, message: e?.message || 'Internal Server Error' }));
    }
    on(status, handler) { this._handlers.set(status, handler); return this; }
    handle(req, error) {
        const status = error?.status || error?.statusCode || 500;
        const handler = this._handlers.get(status);
        return handler ? handler(req, error) : { status, message: error?.message || 'Error' };
    }
    getLayerStatus() { return { name: 'ErrorHandler', type: 'error', enabled: true, handlers: this._handlers.size }; }
}
module.exports.ErrorHandler = ErrorHandler;
module.exports.createErrorHandler = (o) => new ErrorHandler(o);
module.exports.onError = (s, h) => new ErrorHandler().on(s, h);
