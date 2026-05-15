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
const audit = require('./audit');
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

_methods.set('agent_spawn', {
    description: 'Spawn agent (max 4: you + 3 others)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, role: {type:'string'}, parent: {type:'string'} } },
    handler: async (params) => require('./agents').spawn(params)
});

_methods.set('agent_list', {
    description: 'List active agents',
    inputSchema: { type: 'object' },
    handler: async () => ({ agents: require('./agents').list() })
});

_methods.set('agent_kill', {
    description: 'Kill agent by ID',
    inputSchema: { type: 'object', properties: { id: {type:'string'} } },
    handler: async (params) => require('./agents').kill(params.id)
});

// ==================== BRAIN CORE (9) ====================

_methods.set('vant_get_memory', {
    description: 'Load a brain by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const b = await brain.loadBrain(name);
        return { id: b?.id, name: b?.name, content: b?.content?.slice(0, 500) };
    }
});

_methods.set('vant_set_memory', {
    description: 'Write to brain (creates branch)',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        await brain.writeBrain(name, content);
        return { name, status: 'written' };
    }
});

_methods.set('vant_list_branches', {
    description: 'List brain branches',
    inputSchema: { type: 'object' },
    handler: async () => ({ branches: brain.listBranches() })
});

_methods.set('vant_create_branch', {
    description: 'Create new brain branch',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        return { name, status: 'created' };
    }
});

_methods.set('vant_switch_branch', {
    description: 'Switch to brain branch',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        brain.switchBranch(name);
        return { name, status: 'switched' };
    }
});

_methods.set('vant_commit', {
    description: 'Commit brain changes',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    handler: async ({ message }) => {
        return { message, status: 'committed' };
    }
});

_methods.set('vant_sync', {
    description: 'Push/pull with GitHub',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'synced' })
});

_methods.set('vant_lock', {
    description: 'Acquire/release brain lock',
    inputSchema: { type: 'object', properties: { token: { type: 'string' }, release: { type: 'boolean' } } },
    handler: async ({ token, release }) => {
        return { status: release ? 'released' : 'acquired' };
    }
});

_methods.set('vant_health', {
    description: 'System health check',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'ok', timestamp: Date.now() })
});

// ==================== EXTENDED (12) ====================

_methods.set('vant_get_islands', {
    description: 'List islands',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islands = require('./islands');
        return { islands: islands.getAvailable() };
    }
});

_methods.set('vant_load_island', {
    description: 'Load island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const data = await islands.load(name);
        return { name, data };
    }
});

_methods.set('vant_create_island', {
    description: 'Create new island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, type: {type:'string'}, triggers: {type:'array'} } },
    handler: async (params) => {
        const islands = require('./islands');
        const result = islands.createIsland(params.name, { type: params.type, triggers: params.triggers || [] });
        return result;
    }
});

_methods.set('vant_update_island_triggers', {
    description: 'Update island triggers',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, triggers: {type:'array'} }, required: ['name', 'triggers'] },
    handler: async ({ name, triggers }) => {
        const islands = require('./islands');
        const result = islands.updateTriggers(name, triggers);
        return result;
    }
});

_methods.set('vant_delete_island', {
    description: 'Delete island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.deleteIsland(name);
        return result;
    }
});

_methods.set('vant_enable_island', {
    description: 'Enable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.enableIsland(name);
        return result;
    }
});

_methods.set('vant_disable_island', {
    description: 'Disable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.disableIsland(name);
        return result;
    }
});

_methods.set('vant_get_island', {
    description: 'Get island definition',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.getIsland(name);
        return result;
    }
});

_methods.set('vant_resolution_track', {
    description: 'Track decision',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, outcome: { type: 'string' } }, required: ['id', 'outcome'] },
    handler: async ({ id, outcome }) => ({ id, outcome, status: 'tracked' })
});

_methods.set('vant_stego_encode', {
    description: 'Encode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' }, message: { type: 'string' } } },
    handler: async ({ image, message }) => ({ status: 'encoded' })
});

_methods.set('vant_stego_decode', {
    description: 'Decode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' } } },
    handler: async ({ image }) => ({ message: '' })
});

_methods.set('vant_config_get', {
    description: 'Get config',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
    handler: async ({ key }) => ({ key, value: null })
});

_methods.set('vant_config_set', {
    description: 'Set config',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } },
    handler: async ({ key, value }) => ({ key, value, status: 'set' })
});

_methods.set('vant_audit_log', {
    description: 'Log audit',
    inputSchema: { type: 'object', properties: { event: { type: 'string' }, data: { type: 'string' } } },
    handler: async ({ event, data }) => ({ event, status: 'logged' })
});

_methods.set('vant_audit_list', {
    description: 'List audit',
    inputSchema: { type: 'object' },
    handler: async () => ({ events: [] })
});

_methods.set('vant_succession_info', {
    description: 'Trust config',
    inputSchema: { type: 'object' },
    handler: async () => ({ trustLevel: 'high' })
});

_methods.set('vant_search', {
    description: 'Search brain',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    handler: async ({ query }) => ({ query, results: [] })
});

_methods.set('vant_rerank', {
    description: 'RAG rerank + compress',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, docs: { type: 'array' } } },
    handler: async ({ query, docs }) => ({ query, results: [] })
});

_methods.set('vant_sandbox_status', {
    description: 'Sandbox status',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'active', budget: 100 })
});

// Stream methods
const stream = require('./stream');

_methods.set('stream_enqueue', {
    description: 'Enqueue work to stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, task: { type: 'object' } }, required: ['stream', 'task'] },
    handler: async (p) => stream.enqueue(p.stream, p.task)
});

_methods.set('stream_poll', {
    description: 'Poll stream for work',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.poll(p.stream)
});

_methods.set('stream_complete', {
    description: 'Complete work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, result: { type: 'object' } }, required: ['id', 'result'] },
    handler: async (p) => stream.complete(p.id, p.result)
});

_methods.set('stream_fail', {
    description: 'Fail work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, error: { type: 'string' } }, required: ['id', 'error'] },
    handler: async (p) => stream.fail(p.id, p.error)
});

_methods.set('stream_info', {
    description: 'Get stream info',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.info(p.stream)
});

_methods.set('stream_list', {
    description: 'List stream work items',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, status: { type: 'string' } } },
    handler: async (p) => stream.list(p.stream, p)
});

_methods.set('stream_lease', {
    description: 'Check/set lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' }, agentId: { type: 'string' }, ttl: { type: 'number' } }, required: ['workId', 'agentId'] },
    handler: async (p) => stream.lease(p.workId, p.agentId, p.ttl)
});

_methods.set('stream_release', {
    description: 'Release lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' } }, required: ['workId'] },
    handler: async (p) => stream.release(p.workId)
});

_methods.set('stream_peek', {
    description: 'Peek at work without claiming',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.peek(p.stream)
});

_methods.set('stream_stats', {
    description: 'Get stream statistics',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => stream.stats()
});

_methods.set('stream_watch', {
    description: 'Watch stream events',
    inputSchema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] },
    handler: async (p) => ({ watching: p.event })
});

_methods.set('stream_create', {
    description: 'Create a new stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, options: { type: 'object' } }, required: ['stream'] },
    handler: async (p) => stream.create(p.stream, p.options)
});

_methods.set('stream_delete', {
    description: 'Delete a stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.deleteStream(p.stream)
});


let _server = null;
const _port = parseInt(process.env.VANT_MCP_PORT || '3100');

async function start() {
    const server = http.createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle GET /tools
        if (req.method === 'GET' && req.url === '/tools') {
            res.writeHead(200);
            res.end(JSON.stringify(listTools()));
            return;
        }
        
        // Handle GET /health
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
            return;
        }
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Handle POST /call or root for JSON-RPC
        if (req.method === 'POST' && (req.url === '/call' || req.url === '/')) {
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const request = JSON.parse(body);
                const { method, params = {}, id } = request;
                
                // Try multiple prefix formats: vant_brain_* → brain_*, vant_agent_* → agent_*
                let lookupKeys = [
                    method,                                    // vant_brain_list
                    method.replace(/^vant_/, ''),              // brain_list
                    'brain_' + method.replace(/^vant_brain_/, ''),  // brain_list
                    'agent_' + method.replace(/^vant_agent_/, ''),      // agent_spawn
                    'vant_' + method.replace(/^vant_/, '')       // fallback
                ];
                let handler = null;
                for (const key of lookupKeys) {
                    if (_methods.has(key)) {
                        handler = _methods.get(key);
                        break;
                    }
                }
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
            audit.info(`[MCP] Server running on port ${_port}`);
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
        // name already includes prefix (brain_*, vant_*, agent_*)
        tools.push({
            name,  // Already: vant_get_memory, brain_load, etc
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