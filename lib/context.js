/**
 * Vant Context Class
 * Combined request/response context
 */

const Request = require('./request');
const Response = require('./response');

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