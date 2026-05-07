/**
 * Vant Memoize Class
 * Automatic memoization
 */

class Memoize {
    constructor(options = {}) {
        this.options = { ttl: options.ttl || 60000 };
        this._cache = new Map();
        this._startTime = Date.now();
    }
    
    fn(fn) {
        return (...args) => {
            const key = JSON.stringify(args);
            if (this._cache.has(key)) return this._cache.get(key).value;
            const value = fn(...args);
            this._cache.set(key, { value, time: Date.now() });
            return value;
        };
    }
    
    clear() { this._cache.clear(); }
    
    getLayerStatus() { return { name: 'Memoize', type: 'utility', enabled: true, config: { ttl: this.options.ttl }, state: { entries: this._cache.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Memoize' }; }
    getStatus() { return { enabled: true, entries: this._cache.size }; }
}

const defaultMemoize = new Memoize();

module.exports = {
    Memoize, create: (o) => new Memoize(o),
    fn: (f) => defaultMemoize.fn(f),
    clear: () => defaultMemoize.clear(),
    getLayerStatus: () => defaultMemoize.getLayerStatus(),
    isOperationAllowed: (op) => defaultMemoize.isOperationAllowed(op),
    getStatus: () => defaultMemoize.getStatus()
};