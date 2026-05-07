/**
 * Vant Storage Class
 * Simple file/storage abstraction
 */

const fs = require('fs');
const path = require('path');

class Storage {
    constructor(options = {}) {
        this.options = { dir: options.dir || 'states/storage', ...options };
        if (!fs.existsSync(this.options.dir)) fs.mkdirSync(this.options.dir, { recursive: true });
        this._startTime = Date.now();
    }
    
    async set(key, value) {
        const file = path.join(this.options.dir, `${key}.json`);
        fs.writeFileSync(file, JSON.stringify(value));
    }
    
    async get(key) {
        const file = path.join(this.options.dir, `${key}.json`);
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    
    async delete(key) {
        const file = path.join(this.options.dir, `${key}.json`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    
    async list() {
        return fs.readdirSync(this.options.dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    }
    
    getLayerStatus() { return { name: 'Storage', type: 'storage', enabled: true, config: { dir: this.options.dir }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Storage' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    Storage, create: (o) => new Storage(o),
    set: async (k, v) => Storage.prototype.set.call({}, k, v),
    get: async (k) => Storage.prototype.get.call({}, k),
    getLayerStatus: () => ({ name: 'Storage', type: 'storage', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Storage' }),
    getStatus: () => ({ enabled: true })
};