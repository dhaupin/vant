/**
 * Vant MiddlewareStack Class
 * Chain middleware handlers
 */

class MiddlewareStack {
    constructor(options = {}) {
        this.options = { ...options };
        this._stack = [];
        this._startTime = Date.now();
    }
    
    /**
     * Add middleware
     */
    use(fn) {
        this._stack.push(fn);
        return this;
    }
    
    /**
     * Add multiple middleware
     */
    useMany(...fns) {
        this._stack.push(...fns);
        return this;
    }
    
    /**
     * Run middleware chain
     */
    async run(ctx, index = 0) {
        if (index >= this._stack.length) {
            return ctx;
        }
        
        const fn = this._stack[index];
        await fn(ctx, (nextCtx) => this.run(nextCtx || ctx, index + 1));
        
        return ctx;
    }
    
    /**
     * Clear stack
     */
    clear() {
        this._stack = [];
        return this;
    }
    
    /**
     * Get stack size
     */
    size() {
        return this._stack.length;
    }
    
    getLayerStatus() {
        return { name: 'MiddlewareStack', type: 'http', enabled: true, state: { middleware: this._stack.length, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'MiddleWareStack' };
    }
    
    getStatus() {
        return { enabled: true, middleware: this._stack.length };
    }
}

module.exports = {
    MiddlewareStack, create: (o) => new MiddlewareStack(o),
    use: (fn) => { const m = new MiddlewareStack(); m.use(fn); return m; },
    useMany: (...f) => { const m = new MiddlewareStack(); m.useMany(...f); return m; },
    run: (c, i) => new MiddlewareStack().run(c, i),
    getLayerStatus: () => ({ name: 'MiddlewareStack', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'MiddlewareStack' }),
    getStatus: () => ({ enabled: true })
};