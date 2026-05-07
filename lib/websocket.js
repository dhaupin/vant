/**
 * Vant WebSocket Class
 * WebSocket server wrapper
 */

class WebSocket {
    constructor(options = {}) {
        this.options = { port: options.port || 8080, ...options };
        this._clients = new Set();
        this._startTime = Date.now();
    }
    
    broadcast(data) {
        this._clients.forEach(ws => ws.send(data));
    }
    
    onConnection(fn) { this._onConnection = fn; }
    onMessage(fn) { this._onMessage = fn; }
    
    getLayerStatus() { return { name: 'WebSocket', type: 'websocket', enabled: true, state: { clients: this._clients.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'WebSocket' }; }
    getStatus() { return { enabled: true, clients: this._clients.size }; }
}

module.exports = {
    WebSocket, create: (o) => new WebSocket(o),
    broadcast: (d) => console.log('WS broadcast:', d),
    getLayerStatus: () => ({ name: 'WebSocket', type: 'websocket', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'WebSocket' }),
    getStatus: () => ({ enabled: true })
};