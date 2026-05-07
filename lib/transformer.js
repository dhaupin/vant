/**
 * Vant Transformer Class
 * Data transformation
 */

class Transformer {
    constructor(options = {}) { this.options = options; this._startTime = Date.now(); }
    
    transform(data, fn) { return fn(data); }
    
    pipe(...fns) { return d => fns.reduce((r, f) => f(r), d); }
    
    map(fn) { return d => Object.entries(d).map(([k, v]) => [k, fn(v)]); }
    
    getLayerStatus() { return { name: 'Transformer', type: 'utility', enabled: true, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Transformer' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    Transformer, create: (o) => new Transformer(o),
    transform: (d, f) => Transformer.prototype.transform(d, f),
    pipe: (...f) => Transformer.prototype.pipe(...f),
    map: (f) => Transformer.prototype.map(f),
    getLayerStatus: () => ({ name: 'Transformer', type: 'utility', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Transformer' }),
    getStatus: () => ({ enabled: true })
};