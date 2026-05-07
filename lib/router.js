/**
 * Vant Router Class
 * Route matching and dispatch
 */

class Router {
    constructor(options = {}) {
        this.options = { caseSensitive: options.caseSensitive || false };
        this._routes = []; // { method, pattern, handler, params }
        this._startTime = Date.now();
    }
    
    /**
     * Add route
     */
    add(method, pattern, handler) {
        const regex = this._patternToRegex(pattern);
        this._routes.push({ method: method.toUpperCase(), pattern, regex, handler, params: [] });
        return this;
    }
    
    /**
     * GET route
     */
    get(pattern, handler) { return this.add('GET', pattern, handler); }
    
    /**
     * POST route
     */
    post(pattern, handler) { return this.add('POST', pattern, handler); }
    
    /**
     * PUT route
     */
    put(pattern, handler) { return this.add('PUT', pattern, handler); }
    
    /**
     * DELETE route
     */
    delete(pattern, handler) { return this.add('DELETE', pattern, handler); }
    
    /**
     * Match route
     */
    match(method, path) {
        const routes = this._routes.filter(r => r.method === method.toUpperCase());
        for (const route of routes) {
            const match = path.match(route.regex);
            if (match) {
                return { handler: route.handler, params: match.groups || {}, path };
            }
        }
        return null;
    }
    
    /**
     * Convert pattern to regex
     */
    _patternToRegex(pattern) {
        let regex = pattern.replace(/(:\w+)/g, '(?<$1>[^/]+)');
        regex = '^' + regex + '$';
        return new RegExp(regex, this.caseSensitive ? '' : 'i');
    }
    
    /**
     * List routes
     */
    routes() {
        return this._routes.map(r => ({ method: r.method, pattern: r.pattern }));
    }
    
    getLayerStatus() {
        return { name: 'Router', type: 'http', enabled: true, state: { routes: this._routes.length, uptime: Date.now() - this._startTime } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Router' };
    }
    
    getStatus() {
        return { enabled: true, routes: this._routes.length };
    }
}

module.exports = {
    Router, create: (o) => new Router(o),
    get: (p, h) => new Router().get(p, h),
    post: (p, h) => new Router().post(p, h),
    put: (p, h) => new Router().put(p, h),
    delete: (p, h) => new Router().delete(p, h),
    match: (m, p) => new Router().match(m, p),
    getLayerStatus: () => ({ name: 'Router', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Router' }),
    getStatus: () => ({ enabled: true })
};