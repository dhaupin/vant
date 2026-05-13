/**
 * Vant MCP Server
 * 
 * Model Context Protocol - brain tools exposed as JSON-RPC
 * 
 * Usage:
 *   const mcp = require('./mcp');
 *   await mcp.start();  // Starts on VANT_MCP_PORT or 3457
 */

const http = require('http');
const brain = require('./brain');

const _methods = new Map();

// ==================== BRAIN TOOLS ====================

_methods.set('brain_load', {
    description: 'Load a brain by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const b = await brain.loadBrain(name);
        return { id: b?.id, name: b?.name, content: b?.content?.slice(0, 500) };
    }
});

_methods.set('brain_list', {
    description: 'List all available brains',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { brains: brain.listBrains() };
    }
});

_methods.set('brain_state', {
    description: 'Get brain neuron state (synapses, attention)',
    inputSchema: { type: 'object' },
    handler: async () => {
        return brain.getNeuronState();
    }
});

_methods.set('brain_corpus', {
    description: 'Load all brains as corpus',
    inputSchema: { type: 'object' },
    handler: async () => {
        const corpus = brain.loadCorpus();
        return { count: corpus.length };
    }
});

_methods.set('brain_attend', {
    description: 'Set attention score for a brain',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, score: { type: 'number' } }, required: ['name', 'score'] },
    handler: async ({ name, score }) => {
        brain.attend(name, score);
        return { name, score: brain.getAttention(name) };
    }
});

_methods.set('brain_synapses', {
    description: 'Get synapse connections',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { synapses: brain.getSynapses() };
    }
});

// ==================== MCP SERVER ====================

let _server = null;
const _port = parseInt(process.env.VANT_MCP_PORT || '3457');

async function start() {
    const server = http.createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const request = JSON.parse(body);
                const { method, params = {}, id } = request;
                
                const handler = _methods.get(method);
                if (!handler) {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32601, message: 'Method not found' },
                        id
                    }));
                    return;
                }
                
                const result = await handler.handler(params);
                res.writeHead(200);
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    result,
                    id
                }));
            } catch (e) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: e.message },
                    id: null
                }));
            }
        });
    });
    
    return new Promise(resolve => {
        server.listen(_port, () => {
            console.log(`[MCP] Server running on port ${_port}`);
            _server = server;
            resolve({ port: _port });
        });
    });
}

function stop() {
    return new Promise(resolve => {
        if (_server) {
            _server.close(() => resolve());
        } else {
            resolve();
        }
    });
}

function listTools() {
    const tools = [];
    for (const [name, def] of _methods) {
        tools.push({
            name: `brain_${name}`,
            description: def.description,
            inputSchema: def.inputSchema
        });
    }
    return tools;
}

// Export
module.exports = {
    start,
    stop,
    listTools,
    methods: _methods,
    addMethod: (name, def) => _methods.set(name, def)
};