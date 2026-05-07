/**
 * Vant Context Class
 * Combined request/response context
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
    
    method(m) { this._method = m; return this; }
    url(u) { this._url = u; return this; }
    header(k, v) { this._headers.set(k.toLowerCase(), v); return this; }
    get(k) { return this._headers.get(k.toLowerCase()); }
}

class Response {
    constructor(options = {}) {
        this.options = { ...options };
        this._status = 200;
        this._headers = new Map();
        this._body = null;
        this._sent = false;
        this._startTime = Date.now();
    }
    
    status(code) { this._status = code; return this; }
    header(k, v) { this._headers.set(k, v); return this; }
    send(body) { this._body = body; this._sent = true; return this; }
    json(data) { this.header('Content-Type', 'application/json'); this._body = JSON.stringify(data); this._sent = true; return this; }
    redirect(url) { this._status = 302; this.header('Location', url); this._sent = true; return this; }
}

class Context {
    constructor(options = {}) {
        this.options = { ...options };
        this.request = new Request();
        this.response = new Response();
        this._params = {};
        this._state = {};
        this._startTime = Date.now();
    }
    
    /**
     * Set param
     */
    param(key, value) {
        this._params[key] = value;
        return this;
    }
    
    /**
     * Get param
     */
    param(key) {
        return this._params[key];
    }
    
    /**
     * Set state
     */
    state(key, value) {
        this._state[key] = value;
        return this;
    }
    
    /**
     * Get state
     */
    state(key) {
        return this._state[key];
    }
    
    /**
     * Send response
     */
    send(body) {
        return this.response.send(body);
    }
    
    /**
     * Send JSON
     */
    json(data) {
        return this.response.json(data);
    }
    
    /**
     * Redirect
     */
    redirect(url) {
        return this.response.redirect(url);
    }
    
    /**
     * Get status code
     */
    status() {
        return this.response._status;
    }
    
    /**
     * Get response body
     */
    body() {
        return this.response._body;
    }
    
    getLayerStatus() {
        return { name: 'Context', type: 'http', enabled: true, state: { params: Object.keys(this._params).length, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Context' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    Context, create: (o) => new Context(o),
    param: (k, v) => new Context().param(k, v),
    state: (k, v) => new Context().state(k, v),
    send: (b) => new Context().send(b),
    json: (d) => new Context().json(d),
    getLayerStatus: () => ({ name: 'Context', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Context' }),
    getStatus: () => ({ enabled: true })
};