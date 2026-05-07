/**
 * Vant Buffer Class
 * Binary buffer utilities
 */

class Buffer {
    constructor(options = {}) {
        this.options = { encoding: options.encoding || 'utf8' };
        this._data = [];
        this._startTime = Date.now();
    }
    
    write(data) { this._data.push(data); }
    
    toString() { return this._data.join(''); }
    
    toBase64() { return Buffer.from(this.toString()).toString('base64'); }
    
    fromBase64(str) { return Buffer.from(str, 'base64').toString(); }
    
    clear() { this._data = []; }
    
    getLayerStatus() { return { name: 'Buffer', type: 'utility', enabled: true, state: { data: this._data.length, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Buffer' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    Buffer, create: (o) => new Buffer(o),
    write: (d) => { const b = new Buffer(); b.write(d); return b; },
    toBase64: (s) => Buffer.from(s).toString('base64'),
    fromBase64: (s) => Buffer.from(s, 'base64').toString(),
    getLayerStatus: () => ({ name: 'Buffer', type: 'utility', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Buffer' }),
    getStatus: () => ({ enabled: true })
};