/**
 * Vant Response Class
 * HTTP response abstraction
 */

class Response {
    constructor(options = {}) {
        this.options = { ...options };
        this._status = 200;
        this._headers = new Map();
        this._body = null;
        this._sent = false;
        this._startTime = Date.now();
    }
    
    /**
     * Set status
     */
    status(code) {
        this._status = code;
        return this;
    }
    
    /**
     * Set header
     */
    header(key, value) {
        this._headers.set(key, value);
        return this;
    }
    
    /**
     * Set body
     */
    send(body) {
        this._body = body;
        this._sent = true;
        return this;
    }
    
    /**
     * Send JSON
     */
    json(data) {
        this.header('Content-Type', 'application/json');
        this._body = JSON.stringify(data);
        this._sent = true;
        return this;
    }
    
    /**
     * Send text
     */
    text(data) {
        this.header('Content-Type', 'text/plain');
        this._body = data;
        this._sent = true;
        return this;
    }
    
    /**
     * Send HTML
     */
    html(data) {
        this.header('Content-Type', 'text/html');
        this._body = data;
        this._sent = true;
        return this;
    }
    
    /**
     * Set cookie
     */
    cookie(name, value, options = {}) {
        let cookie = `${name}=${value}`;
        if (options.httpOnly) cookie += '; HttpOnly';
        if (options.secure) cookie += '; Secure';
        if (options.sameSite) cookie += '; SameSite=' + options.sameSite;
        if (options.maxAge) cookie += '; Max-Age=' + options.maxAge;
        this.header('Set-Cookie', cookie);
        return this;
    }
    
    /**
     * Redirect
     */
    redirect(url) {
        this._status = 302;
        this.header('Location', url);
        this._sent = true;
        return this;
    }
    
    getLayerStatus() {
        return { name: 'Response', type: 'http', enabled: true, state: { status: this._status, sent: this._sent, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Response' };
    }
    
    getStatus() {
        return { enabled: true, status: this._status };
    }
}

module.exports = {
    Response, create: (o) => new Response(o),
    status: (s) => new Response().status(s),
    header: (k, v) => new Response().header(k, v),
    send: (b) => new Response().send(b),
    json: (d) => new Response().json(d),
    text: (d) => new Response().text(d),
    html: (d) => new Response().html(d),
    getLayerStatus: () => ({ name: 'Response', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Response' }),
    getStatus: () => ({ enabled: true })
};