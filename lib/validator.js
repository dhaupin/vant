/**
 * Vant Validator Class
 * Input validation
 */

class Validator {
    constructor(options = {}) { this.options = options; this._startTime = Date.now(); }
    
    string(val) { return typeof val === 'string' && val.length > 0; }
    number(val) { return typeof val === 'number' && !isNaN(val); }
    boolean(val) { return typeof val === 'boolean'; }
    object(val) { return val && typeof val === 'object' && !Array.isArray(val); }
    array(val) { return Array.isArray(val); }
    email(val) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val); }
    url(val) { try { new URL(val); return true; } catch { return false; } }
    uuid(val) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val); }
    
    validate(val, type) { return this[type] ? this[type](val) : false; }
    
    required(val) { return val !== null && val !== undefined && val !== ''; }
    
    min(val, min) { return this.number(val) ? val >= min : val.length >= min; }
    max(val, max) { return this.number(val) ? val <= max : val.length <= max; }
    
    getLayerStatus() { return { name: 'Validator', type: 'utility', enabled: true, state: { uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Validator' }; }
    getStatus() { return { enabled: true }; }
}

const defaultValidator = new Validator();

module.exports = {
    Validator, create: (o) => new Validator(o),
    string: (v) => defaultValidator.string(v),
    number: (v) => defaultValidator.number(v),
    boolean: (v) => defaultValidator.boolean(v),
    object: (v) => defaultValidator.object(v),
    array: (v) => defaultValidator.array(v),
    email: (v) => defaultValidator.email(v),
    url: (v) => defaultValidator.url(v),
    uuid: (v) => defaultValidator.uuid(v),
    required: (v) => defaultValidator.required(v),
    min: (v, m) => defaultValidator.min(v, m),
    max: (v, m) => defaultValidator.max(v, m),
    getLayerStatus: () => defaultValidator.getLayerStatus(),
    isOperationAllowed: (op) => defaultValidator.isOperationAllowed(op),
    getStatus: () => defaultValidator.getStatus()
};