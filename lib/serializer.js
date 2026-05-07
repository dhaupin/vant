/**
 * Vant Serializer Class
 * JSON/MsgPack serialization
 */

class Serializer {
    constructor(options = {}) {
        this.options = { format: options.format || 'json', ...options };
        this._startTime = Date.now();
    }
    
    serialize(data) {
        if (this.options.format === 'json') return JSON.stringify(data);
        return data;
    }
    
    deserialize(str) {
        if (this.options.format === 'json') return JSON.parse(str);
        return str;
    }
    
    getLayerStatus() { return { name: 'Serializer', type: 'serialize', enabled: true, config: { format: this.options.format }, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Serializer' }; }
    getStatus() { return { enabled: true }; }
}

module.exports = {
    Serializer, create: (o) => new Serializer(o),
    serialize: (d) => JSON.stringify(d),
    deserialize: (s) => JSON.parse(s),
    getLayerStatus: () => ({ name: 'Serializer', type: 'serialize', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Serializer' }),
    getStatus: () => ({ enabled: true })
};