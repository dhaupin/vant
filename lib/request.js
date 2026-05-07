/**
 * Vant Request Class
 * HTTP request abstraction
 */

class Request {
    constructor(options = {}) {
        this.options = { ...options };
        this._headers = new Map();
        this._params = {};
        this._query = {};
        this._body = null;
        this._method = 'GET';
        this._url = '/';
        this._startTime = Date.now();
    }
    
    /**
     * Set header
     */
    header(key, value) {
        this._headers.set(key.toLowerCase(), value);
        return this;
    }
    
    /**
     * Get header
     */
    get(key) {
        return this._headers.get(key.toLowerCase());
    }
    
    /**
     * Set method
     */
    method(m) {
        this._method = m;
        return this;
    }
    
    /**
     * Set URL
     */
    url(u) {
        this._url = u;
        return this;
    }
    
    /**
     * Set params
     */
    params(p) {
        this._params = p;
        return this;
    }
    
    /**
     * Set query
     */
    query(q) {
        this._query = q;
        return this;
    }
    
    /**
     * Set body
     */
    body(b) {
        this._body = b;
        return this;
    }
    
    /**
     * Get all headers
     */
    headers() {
        return Object.fromEntries(this._headers);
    }
    
    /**
     * Check content type
     */
    is(type) {
        const contentType = this.get('content-type') || '';
        return contentType.includes(type);
    }
    
    /**
     * Check if JSON
     */
    isJSON() { return this.is('json'); }
    
    /**
     * Check if form
     */
    isForm() { return this.is('application/x-www-form-urlencoded'); }
    
    getLayerStatus() {
        return { name: 'Request', type: 'http', enabled: true, state: { method: this._method, url: this._url, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Request' };
    }
    
    getStatus() {
        return { enabled: true, method: this._method };
    }
}

// Exports
module.exports = {
    Request, create: (o) => new Request(o),
    header: (k, v) => new Request().header(k, v),
    get: (k) => new Request().get(k),
    method: (m) => new Request().method(m),
    getLayerStatus: () => ({ name: 'Request', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Request' }),
    getStatus: () => ({ enabled: true })
};