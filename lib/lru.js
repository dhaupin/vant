/**
 * Vant LRU Class
 * LRU cache (standalone)
 */

class LRU {
    constructor(options = {}) {
        this.options = { max: options.max || 100 };
        this._cache = new Map();
        this._startTime = Date.now();
    }
    
    get(key) {
        if (!this._cache.has(key)) return null;
        const val = this._cache.get(key);
        this._cache.delete(key);
        this._cache.set(key, val);
        return val;
    }
    
    set(key, value) {
        if (this._cache.has(key)) this._cache.delete(key);
        else if (this._cache.size >= this.options.max) this._cache.delete(this._cache.keys().next().value);
        this._cache.set(key, value);
    }
    
    has(key) { return this._cache.has(key); }
    delete(key) { return this._cache.delete(key); }
    clear() { this._cache.clear(); }
    size() { return this._cache.size; }
    
    getLayerStatus() { return { name: 'LRU', type: 'utility', enabled: true, config: { max: this.options.max }, state: { size: this._cache.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'LRU' }; }
    getStatus() { return { enabled: true, size: this._cache.size }; }
}

module.exports = {
    LRU, create: (o) => new LRU(o),
    get: (k) => { const l = new LRU(); return l.get(k); },
    set: (k, v) => { const l = new LRU(); l.set(k, v); },
    getLayerStatus: () => ({ name: 'LRU', type: 'utility', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'LRU' }),
    getStatus: () => ({ enabled: true })
};