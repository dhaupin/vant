/**
 * Relay - Agent-to-Agent Transport
 * 
 * The actual transport layer for meeting other agents.
 * How agents actually connect and communicate.
 * 
 * Transport methods:
 * - HTTP: Direct agent URLs
 * - WebSocket: Real-time
 * - Brain: Via shared GitHub brain
 * - MCP: Model Context Protocol
 * 
 * Usage:
 *   const relay = require('./relay');
 *   await relay.listen();  // Start HTTP server
 *   await relay.connect('http://other-agent:3457');
 *   await relay.send('hello!');
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class Relay {
  constructor(options = {}) {
    this.port = options.port || 3457;
    this.host = options.host || '0.0.0.0';
    this.connections = new Map(); // Connected peers
    this.server = null;
    this.messageHandler = null;
  }
  
  /**
   * Get the port this relay is configured for
   */
  getPort() {
    return this.port;
  }
  
  /**
   * Get the host this relay is configured for
   */
  getHost() {
    return this.host;
  }
  
  /**
   * Start relay server (listen for connections)
   */
  async listen(options = {}) {
    const port = options.port || this.port;
    const host = options.host || this.host;
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        await this._handleRequest(req, res);
      });
      
      this.server.listen(port, host, () => {
        console.log('[Relay] Listening on http://' + host + ':' + port);
        resolve({ port, host });
      });
    });
  }
  
  /**
   * Handle incoming request
   */
  async _handleRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    
    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Routes
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', relay: 'active' }));
      return;
    }
    
    if (url.pathname === '/meet') {
      // Handle meeting request
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const encounter = require('./encounter');
          
          // Register peer
          encounter.encounter.registerPeer({
            name: data.from,
            url: data.url,
            type: data.type || 'Unknown Agent'
          });
          
          // Respond with my info
          const consciousness = require('./consciousness');
          const who = consciousness.consciousness.whoAmI();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            accepted: true,
            identity: who,
            welcome: 'Welcome to Vant relay!'
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    if (url.pathname === '/message') {
      // Handle message
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          
          // Emit message event
          const event = require('./event');
          event.emit('relay:message', data);
          
          // Call custom handler if set
          if (this.messageHandler) {
            await this.messageHandler(data);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
  
  /**
   * Connect to another agent
   */
  async connect(targetUrl) {
    try {
      const target = new URL(targetUrl);
      
      // Send meet request
      const consciousness = require('./consciousness');
      const who = consciousness.consciousness.whoAmI();
      
      const response = await this._request(targetUrl + '/meet', {
        from: who.name,
        url: 'http://localhost:' + this.port,
        type: who.type,
        purpose: who.purpose
      });
      
      if (response.accepted) {
        this.connections.set(response.identity.name, {
          url: targetUrl,
          identity: response.identity,
          connected: Date.now()
        });
        
        console.log('[Relay] Connected to:', response.identity.name);
        return { connected: response.identity.name };
      }
      
      return { error: 'Connection rejected' };
    } catch (e) {
      return { error: e.message };
    }
  }
  
  /**
   * Send message to peer
   */
  async send(peerName, message) {
    const peer = this.connections.get(peerName);
    if (!peer) {
      return { error: 'Peer not connected' };
    }
    
    const consciousness = require('./consciousness');
    const who = consciousness.consciousness.whoAmI();
    
    return this._request(peer.url + '/message', {
      from: who.name,
      to: peerName,
      message,
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast to all peers
   */
  async broadcast(message) {
    const results = [];
    for (const peerName of this.connections.keys()) {
      const result = await this.send(peerName, message);
      results.push({ peer: peerName, result });
    }
    return results;
  }
  
  /**
   * Set message handler
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }
  
  /**
   * Get connected peers
   */
  getPeers() {
    return Array.from(this.connections.entries()).map(([name, data]) => ({
      name,
      url: data.url,
      connected: data.connected
    }));
  }
  
  /**
   * Disconnect from peer
   */
  disconnect(peerName) {
    const removed = this.connections.delete(peerName);
    return { removed };
  }
  
  /**
   * Stop server
   */
  async stop() {
    if (this.server) {
      return new Promise(resolve => {
        this.server.close(() => {
          console.log('[Relay] Stopped');
          resolve({ stopped: true });
        });
      });
    }
  }
  
  /**
   * Internal: Make HTTP request
   */
  _request(url, data) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      
      const body = JSON.stringify(data);
      
      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });
      
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = {
  Relay,
  createRelay: (options) => new Relay(options)
};
