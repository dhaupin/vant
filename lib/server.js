/**
 * Vant Server Class
 * HTTP server wrapper
 */

const http = require('http');

class Server {
    constructor(options = {}) {
        this.options = {
            port: options.port || 3000,
            host: options.host || '0.0.0.0',
            ...options
        };
        this._server = null;
        this._router = null;
        this._startTime = null;
    }
    
    /**
     * Set router
     */
    use(router) {
        this._router = router;
        return this;
    }
    
    /**
     * Start server
     */
    listen(port, host) {
        const p = port || this.options.port;
        const h = host || this.options.host;
        
        this._server = http.createServer(async (req, res) => {
            if (this._router) {
                const url = req.url.split('?')[0];
                const method = req.method;
                const route = this._router.match(method, url);
                
                if (route) {
                    const Context = require('./context').Context;
                    const ctx = new Context();
                    ctx.request.method(method).url(url);
                    ctx.response.status(200);
                    
                    try {
                        const result = await route.handler(ctx);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(result));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not Found' }));
                }
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ vant: 'running' }));
            }
        });
        
        return new Promise((resolve) => {
            this._server.listen(p, h, () => {
                this._startTime = Date.now();
                console.log(`[Server] Listening on ${h}:${p}`);
                resolve(this);
            });
        });
    }
    
    /**
     * Stop server
     */
    stop() {
        return new Promise((resolve) => {
            if (this._server) {
                this._server.close(() => {
                    console.log('[Server] Stopped');
                    resolve(this);
                });
            } else {
                resolve(this);
            }
        });
    }
    
    getLayerStatus() {
        return { name: 'Server', type: 'http', enabled: true, config: { port: this.options.port }, state: { running: !!this._server, uptime: this._startTime ? Date.now() - this._startTime : 0 } };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Server' };
    }
    
    getStatus() {
        return { enabled: true, running: !!this._server };
    }
}

module.exports = {
    Server, create: (o) => new Server(o),
    use: (r) => new Server().use(r),
    listen: (p, h) => new Server().listen(p, h),
    stop: () => new Server().stop(),
    getLayerStatus: () => ({ name: 'Server', type: 'http', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Server' }),
    getStatus: () => ({ enabled: true })
};