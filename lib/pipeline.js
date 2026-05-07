/**
 * Vant Pipeline Class
 * Hooks and middleware composition, pre/post execution chains
 */

class Pipeline {
    constructor(options = {}) {
        this.options = options;
        this._middleware = [];
        this._startTime = Date.now();
    }
    
    use(fn) { this._middleware.push(fn); }
    
    remove(fn) {
        const idx = this._middleware.indexOf(fn);
        if (idx !== -1) this._middleware.splice(idx, 1);
    }
    
    async execute(handler, ctx = {}) {
        let index = 0;
        const next = async () => {
            if (index >= this._middleware.length) return handler(ctx);
            return this._middleware[index++](ctx, next);
        };
        return next();
    }
    
    size() { return this._middleware.length; }
    clear() { this._middleware = []; }
    
    getLayerStatus() {
        return { name: 'Pipeline', type: 'pipeline', enabled: true, state: { middleware: this._middleware.length, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(operationType) {
        return { allowed: true, layer: 'Pipeline' };
    }
    
    getStatus() {
        return { enabled: true, middleware: this._middleware.length };
    }
}

const defaultPipeline = new Pipeline();

module.exports = {
    Pipeline, create: (o) => new Pipeline(o),
    use: (fn) => defaultPipeline.use(fn),
    remove: (fn) => defaultPipeline.remove(fn),
    execute: (h, c) => defaultPipeline.execute(h, c),
    size: () => defaultPipeline.size(),
    clear: () => defaultPipeline.clear(),
    getLayerStatus: () => defaultPipeline.getLayerStatus(),
    isOperationAllowed: (op) => defaultPipeline.isOperationAllowed(op),
    getStatus: () => defaultPipeline.getStatus()
};