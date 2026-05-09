/**
 * Vant ErrorHandler Class
 * Centralized error handling
 * 
 * Integrates with lib/errors.js for consistent error codes
 */

let errors;
try {
    errors = require('./errors');
} catch (e) {
    errors = null;
}

class ErrorHandler {
    constructor(options = {}) {
        this.options = { 
            showErrors: options.showErrors || false,
            logErrors: options.logErrors || true,
            ...options 
        };
        this._handlers = new Map();
        this._startTime = Date.now();
        
        // Default error types
        this._handlers.set(404, this._notFound.bind(this));
        this._handlers.set(500, this._serverError.bind(this));
    }
    
    /**
     * Register error handler
     */
    on(status, handler) {
        this._handlers.set(status, handler);
        return this;
    }
    
    /**
     * Handle error
     */
    async handle(ctx, error) {
        const status = error.status || error.code || 500;
        const handler = this._handlers.get(status) || this._handlers.get(500);
        
        ctx.response.status(status);
        
        // Build consistent error response with codes if available
        let errorBody = { error: 'Error', status };
        
        if (this.options.showErrors && error.message) {
            errorBody.error = error.message;
        }
        
        // Add error code from VantError if available
        if (errors && error instanceof errors.VantError) {
            errorBody.code = error.code;
            errorBody.retryable = error.retryable;
        }
        
        if (this.options.logErrors) {
            const logPrefix = errors && error instanceof errors.VantError 
                ? `[ErrorHandler] ${error.code}: ${error.message}` 
                : `[ErrorHandler] ${status}: ${error.message}`;
            console.error(logPrefix);
        }
        
        ctx.response.json(errorBody);
        
        return ctx;
    }
    
    /**
     * Handle 404
     */
    _notFound(ctx) {
        ctx.response.status(404);
        ctx.response.json({ error: 'Not Found', status: 404 });
    }
    
    /**
     * Handle 500
     */
    _serverError(ctx, error) {
        ctx.response.status(500);
        ctx.response.json({ error: 'Internal Server Error', status: 500 });
    }
    
    /**
     * Not found handler
     */
    notFound(ctx) {
        this._handlers.get(404)(ctx);
    }
    
    /**
     * Server error handler
     */
    serverError(ctx, error) {
        this._handlers.get(500)(ctx, error);
    }
    
    getLayerStatus() {
        return { 
            name: 'ErrorHandler', 
            type: 'http', 
            enabled: true, 
            config: { showErrors: this.options.showErrors, handlers: this._handlers.size }, 
            state: { uptime: Date.now() - this._startTime },
            codes: errors ? Object.keys(errors.CODES) : []
        };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'ErrorHandler' };
    }
    
    getStatus() {
        return { enabled: true, handlers: this._handlers.size };
    }
}

module.exports = {
    ErrorHandler, create: (o) => new ErrorHandler(o),
    on: (s, h) => new ErrorHandler().on(s, h),
    handle: (c, e) => new ErrorHandler().handle(c, e),
    notFound: (c) => new ErrorHandler().notFound(c),
    serverError: (c, e) => new ErrorHandler().serverError(c, e),
    getLayerStatus: () => ({ name: 'ErrorHandler', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'ErrorHandler' }),
    getStatus: () => ({ enabled: true })
};