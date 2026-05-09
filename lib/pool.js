const fs = require('fs');
const path = require('path');

const Pool = class Pool {
    constructor(options = {}) {
        this._options = { type: options.type || 'resource', size: options.size || 10, factory: options.factory, encoding: options.encoding || 'utf8', dir: options.dir || 'states/storage', ...options };
        this._type = this._options.type;
        this._startTime = Date.now();
        this._resources = [];
        this._inUse = new Set();
        this._bufferData = [];
        if (this._type === 'storage' && !fs.existsSync(this._options.dir)) fs.mkdirSync(this._options.dir, { recursive: true });
        if (this._type === 'resource' && this._options.factory) for (let i = 0; i < this._options.size; i++) this._resources.push(this._options.factory());
    }
    write(data) { this._bufferData.push(data); }
    toString() { return this._bufferData.join(''); }
    toBase64() { return Buffer.from(this.toString()).toString('base64'); }
    fromBase64(str) { return Buffer.from(str, 'base64').toString(); }
    clearBuffer() { this._bufferData = []; }
    async set(key, value) { const file = path.join(this._options.dir, key + '.json'); fs.writeFileSync(file, JSON.stringify(value)); }
    async get(key) { const file = path.join(this._options.dir, key + '.json'); if (!fs.existsSync(file)) return null; return JSON.parse(fs.readFileSync(file, 'utf8')); }
    async delete(key) { const file = path.join(this._options.dir, key + '.json'); if (fs.existsSync(file)) fs.unlinkSync(file); }
    async list() { return fs.readdirSync(this._options.dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')); }
    async acquire() { if (this._resources.length === 0) await new Promise(r => setTimeout(r, 10)); const resource = this._resources.pop() || this._options.factory(); this._inUse.add(resource); return resource; }
    release(resource) { this._inUse.delete(resource); this._resources.push(resource); }
    getSize() { return this._resources.length; }
    getInUse() { return this._inUse.size; }
    getBufferLength() { return this._bufferData.length; }
    getLayerStatus() { return { name: 'Pool', type: 'unified', enabled: true, config: { type: this._type, size: this._options.size, dir: this._options.dir }, state: { type: this._type, bufferLength: this._bufferData.length, resourcesAvailable: this._resources.length, resourcesInUse: this._inUse.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Pool' }; }
    getStatus() { return { enabled: true, type: this._type }; }
};

function create(options) { return new Pool(options); }
function toBase64(s) { return Buffer.from(s).toString('base64'); }
function fromBase64(s) { return Buffer.from(s, 'base64').toString(); }
async function storageSet(dir, key, value) { const p = new Pool({ type: 'storage', dir }); await p.set(key, value); }
async function storageGet(dir, key) { const p = new Pool({ type: 'storage', dir }); return p.get(key); }

module.exports = { Pool, create, toBase64, fromBase64, storageSet, storageGet, getLayerStatus: () => ({ name: 'Pool', type: 'unified', enabled: true }), isOperationAllowed: (op) => ({ allowed: true, layer: 'Pool' }), getStatus: () => ({ enabled: true, type: 'unified' }) };
