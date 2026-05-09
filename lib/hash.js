/**
 * Vant Hash Class
 * Wrapper to Encrypt.js for backward compatibility
 */

const Encrypt = require('./encrypt');

class Hash {
    constructor(options = {}) {
        this.options = { algorithm: options.algorithm || 'md5', servers: options.servers || [] };
        this._servers = [];
        this._startTime = Date.now();
    }

    md5(str) { return Encrypt.md5(str); }
    sha256(str) { return Encrypt.sha256(str); }

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

module.exports = Hash;
