/**
 * Vant Pool Class
 * Connection/worker pool
 */

class Pool {
    constructor(options = {}) {
        this.options = { size: options.size || 10, factory: options.factory };
        this._available = [];
        this._inUse = new Set();
        this._startTime = Date.now();
        
        for (let i = 0; i < this.options.size; i++) this._available.push(this.options.factory ? this.options.factory() : i);
    }
    
    async acquire() {
        if (this._available.length === 0) await new Promise(r => setTimeout(r, 10));
        const resource = this._available.pop() || this._factory();
        this._inUse.add(resource);
        return resource;
    }
    
    release(resource) {
        this._inUse.delete(resource);
        this._available.push(resource);
    }
    
    getSize() { return this._available.length; }
    getInUse() { return this._inUse.size; }
    
    getLayerStatus() { return { name: 'Pool', type: 'utility', enabled: true, config: { size: this.options.size }, state: { available: this._available.length, inUse: this._inUse.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Pool' }; }
    getStatus() { return { enabled: true, available: this._available.length, inUse: this._inUse.size }; }
}

module.exports = {
    Pool, create: (o) => new Pool(o),
    acquire: async () => { const p = new Pool(); return p.acquire(); },
    release: (r) => { const p = new Pool(); p.release(r); },
    getLayerStatus: () => ({ name: 'Pool', type: 'utility', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Pool' }),
    getStatus: () => ({ enabled: true })
};