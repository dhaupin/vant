/**
 * Vant Hash Class
 * Consistent hashing
 */

const crypto = require('crypto');

class Hash {
    constructor(options = {}) {
        this.options = { algorithm: options.algorithm || 'md5', servers: options.servers || [] };
        this._servers = [];
        this._startTime = Date.now();
    }
    
    md5(str) { return crypto.createHash('md5').update(str).digest('hex'); }
    sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
    
    consistent(key, buckets = 512) {
        const hash = this.md5(key);
        return parseInt(hash.slice(0, 8), 16) % buckets;
    }
    
    addServer(server) { this._servers.push(server); }
    removeServer(server) { this._servers = this._servers.filter(s => s !== server); }
    
    getLayerStatus() { return { name: 'Hash', type: 'utility', enabled: true, config: { algorithm: this.options.algorithm }, state: { servers: this._servers.length, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Hash' }; }
    getStatus() { return { enabled: true }; }
}

const defaultHash = new Hash();

module.exports = {
    Hash, create: (o) => new Hash(o),
    md5: (s) => defaultHash.md5(s),
    sha256: (s) => defaultHash.sha256(s),
    consistent: (k, b) => defaultHash.consistent(k, b),
    getLayerStatus: () => defaultHash.getLayerStatus(),
    isOperationAllowed: (op) => defaultHash.isOperationAllowed(op),
    getStatus: () => defaultHash.getStatus()
};