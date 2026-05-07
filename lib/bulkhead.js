/**
 * Vant Bulkhead Class
 * Concurrency isolation
 */

class Bulkhead {
    constructor(options = {}) {
        this.options = { concurrency: options.concurrency || 10 };
        this._running = 0;
        this._queue = [];
        this._startTime = Date.now();
    }
    
    async run(fn) {
        if (this._running >= this.options.concurrency) {
            return new Promise(r => this._queue.push(() => r(this.run(fn))));
        }
        this._running++;
        try { return await fn(); }
        finally { this._running--; if (this._queue.length) this._queue.shift()(); }
    }
    
    getLayerStatus() { return { name: 'Bulkhead', type: 'utility', enabled: true, config: { concurrency: this.options.concurrency }, state: { running: this._running, queue: this._queue.length, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Bulkhead' }; }
    getStatus() { return { enabled: true, running: this._running }; }
}

const defaultBulkhead = new Bulkhead();

module.exports = {
    Bulkhead, create: (o) => new Bulkhead(o),
    run: (f) => defaultBulkhead.run(f),
    getLayerStatus: () => defaultBulkhead.getLayerStatus(),
    isOperationAllowed: (op) => defaultBulkhead.isOperationAllowed(op),
    getStatus: () => defaultBulkhead.getStatus()
};