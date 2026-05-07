/**
 * Vant Throttler Class
 * Throttle function calls
 */

class Throttler {
    constructor(options = {}) {
        this.options = { limit: options.limit || 10, window: options.window || 1000 };
        this._calls = new Map();
        this._startTime = Date.now();
    }
    
    throttle(fn) {
        return (...args) => {
            const key = fn.name || Math.random().toString(36);
            const now = Date.now();
            const calls = (this._calls.get(key) || []).filter(t => now - t < this.options.window);
            if (calls.length >= this.options.limit) return;
            calls.push(now);
            this._calls.set(key, calls);
            fn(...args);
        };
    }
    
    clear() { this._calls.clear(); }
    
    getLayerStatus() { return { name: 'Throttler', type: 'utility', enabled: true, config: { limit: this.options.limit, window: this.options.window }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Throttler' }; }
    getStatus() { return { enabled: true }; }
}

const defaultThrottler = new Throttler();

module.exports = {
    Throttler, create: (o) => new Throttler(o),
    throttle: (f) => defaultThrottler.throttle(f),
    clear: () => defaultThrottler.clear(),
    getLayerStatus: () => defaultThrottler.getLayerStatus(),
    isOperationAllowed: (op) => defaultThrottler.isOperationAllowed(op),
    getStatus: () => defaultThrottler.getStatus()
};