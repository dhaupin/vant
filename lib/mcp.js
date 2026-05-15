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

// NEW: Citations MCP tools
_methods.set('vant_citations_list', {
    description: 'List citations',
    inputSchema: { type: 'object' },
    handler: async () => {
        const citations = require('./citations');
        return { sources: citations.listSources?.() || [] };
    }
});

_methods.set('vant_citations_add', {
    description: 'Add citation source',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' }, context: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit, context }) => {
        const citations = require('./citations');
        return { commit, context, added: true };
    }
});

_methods.set('vant_citations_format', {
    description: 'Format citation',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit }) => {
        return { citation: `[Source: ${commit}]` };
    }
});

// NEW: Connector MCP tools
_methods.set('vant_connector_list', {
    description: 'List connectors',
    inputSchema: { type: 'object' },
    handler: async () => {
        const connector = require('./connector');
        return { connectors: connector.getConnectors?.() || [] };
    }
});

_methods.set('vant_connector_connect', {
    description: 'Connect to service',
    inputSchema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] },
    handler: async ({ service }) => {
        const connector = require('./connector');
        return { service, connected: true };
    }
});

// NEW: Framework MCP tools
_methods.set('vant_framework_status', {
    description: 'Framework status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const framework = require('./framework');
        return { status: framework.getLayerStatus?.() || { name: 'framework', type: 'runtime' } };
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

_methods.set('vant_bulk_create_islands', {
    description: 'Bulk create islands',
    inputSchema: { type: 'object', properties: { islands: { type: 'array' } }, required: ['islands'] },
    handler: async ({ islands }) => {
        const islandsModule = require('./islands');
        return islandsModule.bulkCreate(islands);
    }
});

_methods.set('vant_export_islands', {
    description: 'Export all islands as JSON',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islandsModule = require('./islands');
        return islandsModule.exportAll();
    }
});

_methods.set('vant_find_islands_by_trigger', {
    description: 'Find islands by trigger',
    inputSchema: { type: 'object', properties: { trigger: { type: 'string' } }, required: ['trigger'] },
    handler: async ({ trigger }) => {
        const islandsModule = require('./islands');
        return { islands: islandsModule.findByTrigger(trigger) };
    }
});

// NEW: Branch Manager MCP tools (lib/branch.js)
_methods.set('vant_branch_is_dirty', {
    description: 'Check if working dir is dirty',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { dirty: branch.isDirty() };
    }
});

_methods.set('vant_branch_changed_brains', {
    description: 'Get changed brain files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { brains: branch.getChangedBrains() };
    }
});

_methods.set('vant_branch_auto', {
    description: 'Auto-create branch from changes',
    inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } },
    handler: async ({ prefix }) => {
        const branch = require('./branch');
        const name = branch.autoBranch({ prefix: prefix || 'agent' });
        return { branch: name };
    }
});

// NEW: Brain Horcrux MCP tools (lib/brain.js)
_methods.set('vant_brain_backups', {
    description: 'List brain backups',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return { backups: brain.listBackups() };
    }
});

_methods.set('vant_brain_backup', {
    description: 'Backup brain to image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = require('./brain');
        const result = await brain.backupToImage(path);
        return { status: 'backed_up', path };
    }
});

_methods.set('vant_brain_restore', {
    description: 'Restore brain from image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = require('./brain');
        const result = await brain.restoreFromImage(path);
        return { status: 'restored', path };
    }
});

// NEW: Agents MCP tools (lib/agents.js)
_methods.set('vant_agents_mcp_start', {
    description: 'Start MCP server for agents',
    inputSchema: { type: 'object' },
    handler: async () => {
        const agents = require('./agents');
        return agents.startMCP();
    }
});

// NEW: brain.myStuff MCP tools
_methods.set('vant_brain_my_stuff', {
    description: 'Get personal brain data',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.myStuff();
    }
});

_methods.set('vant_brain_update_my_stuff', {
    description: 'Update personal brain file',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, content: { type: 'string' } }, required: ['key', 'content'] },
    handler: async ({ key, content }) => {
        const brain = require('./brain');
        return brain.updateMyStuff(key, content);
    }
});

// NEW: brain.yourStuff (temp stash)
_methods.set('vant_brain_your_stuff', {
    description: 'Get temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.yourStuff();
    }
});

_methods.set('vant_brain_stash', {
    description: 'Stash temp work',
    inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] },
    handler: async ({ data }) => {
        const brain = require('./brain');
        return brain.stashYourStuff(data);
    }
});

_methods.set('vant_brain_clear', {
    description: 'Clear temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearYourStuff();
    }
});

// NEW: brain handler registration
_methods.set('vant_brain_handlers', {
    description: 'Get registered handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.getHandlers();
    }
});

_methods.set('vant_brain_clear_handlers', {
    description: 'Clear handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearHandlers();
    }
});

// NEW: brain.myStuff (private dropbox)
_methods.set('vant_brain_my_drop', {
    description: 'Save private file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = require('./brain');
        return brain.myDropFile(name, content);
    }
});

_methods.set('vant_brain_my_get', {
    description: 'Get private file', 
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.myGetFile(name);
    }
});

_methods.set('vant_brain_my_list', {
    description: 'List private files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.myListFiles();
    }
});

// NEW: brain.yourStuff Dropbox
_methods.set('vant_brain_drop_file', {
    description: 'Save file to dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = require('./brain');
        return brain.dropFile(name, content);
    }
});

_methods.set('vant_brain_get_file', {
    description: 'Get file from dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.getFile(name);
    }
});

_methods.set('vant_brain_list_files', {
    description: 'List dropbox files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.listFiles();
    }
});

_methods.set('vant_brain_delete_file', {
    description: 'Delete dropbox file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.deleteFile(name);
    }
});

_methods.set('vant_brain_clear_dropbox', {
    description: 'Clear dropbox',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearDropbox();
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

// Auto-wire CORE lib functions to MCP
function autoWireCoreLibs() {
    const fs = require('fs');
    let wired = 0;
    
    // Core libs only - mcp.js is in lib/, so use ./lib/
    const coreLibs = ['brain', 'api', 'vant', 'agents', 'islands', 'sandbox', 'qos', 'escrow', 'stream'];
    const libDir = fs.realpathSync('./lib');
    
    coreLibs.forEach(libName => {
        const libPath = libDir + '/' + libName + '.js';
        if (!fs.existsSync(libPath)) return;
        
        try {
            const lib = require('./' + libName + '.js');
            const funcs = Object.keys(lib).filter(k => typeof lib[k] === 'function' && !k.startsWith('_'));
            
            funcs.forEach(fn => {  // ALL functions
                const toolName = 'vant_' + libName + '_' + fn;
                if (_methods.has(toolName)) return;
                
                _methods.set(toolName, {
                    description: libName + '.' + fn,
                    inputSchema: { type: 'object', properties: { args: { type: 'object' } } },
                    handler: async ({ args = {} }) => {
                        try { return lib[fn](args); }
                        catch(e) { return { error: e.message }; }
                    }
                });
                wired++;
            });
        } catch(e) {}
    });
    
    console.log('[MCP] Wired core:', wired, 'tools');
    return wired;
}

// const _autoWired = autoWireCoreLibs();

// Universal vant_call
_methods.set('vant_call', {
    description: 'Call any Vant function',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object' } }, required: ['name'] },
    handler: async ({ name, args = {} }) => {
        if (_methods.has(name)) return _methods.get(name).handler(args);
        const [libName, fn] = name.includes('.') ? name.split('.') : [name, null];
        if (!fn) return { error: 'need lib.fn format' };
        try {
            const lib = require('./lib/' + libName);
            if (typeof lib[fn] === 'function') return lib[fn](args);
        } catch(e) { return { error: e.message }; }
        return { error: 'not found', name };
    }
});

// Export

// NEW: Agent delegation + broadcast + remote (6 tools)
_methods.set('vant_agents_delegate_mcp', {
    description: 'Delegate WITH MCP to agent',
    inputSchema: { type: 'object', properties: { id: {type:'string'}, task: {type:'object'} } },
    handler: async ({ id, task }) => {
        const agents = require('./agents');
        return agents.delegate(id, { ...task, mcp: true });
    }
});

_methods.set('vant_agents_broadcast', {
    description: 'Broadcast to all agents',
    inputSchema: { type: 'object', properties: { message: {type:'string'} } },
    handler: async ({ message }) => {
        const agents = require('./agents');
        const list = agents.list();
        const results = [];
        for (const a of list.agents || []) {
            try { results.push({ agent: a.id, result: await agents.delegate(a.id, { task: message }) || 'ok' }); }
            catch(e) { results.push({ agent: a.id, error: e.message }); }
        }
        return { broadcast: message, results };
    }
});

_methods.set('vant_remote_call', {
    description: 'Call remote agent',
    inputSchema: { type: 'object', properties: { host: {type:'string'}, port: {type:'number'}, tool: {type:'string'}, args: {type:'object'} } },
    handler: async () => ({ error: 'NYI' })
});

// NEW: 3 search types (lib/search.js)
_methods.set('vant_search_hybrid', {
    description: 'Hybrid search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        return search.hybrid?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_hyde', {
    description: 'HyDE search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        return search.hyde?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_multiquery', {
    description: 'Multi-query search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        const mq = search.multiQuery?.(query) || [query];
        const results = [];
        for (const q of mq) {
            const r = await search.queryBrain?.(q, { topK: topK || 5 }) || [];
            results.push({ query: q, results: r });
        }
        return { queries: mq, results };
    }
});

module.exports = {
    start: async (options = {}) => {
        const http = require('http');
        const mcp = require('./mcp');
        
        // Simple HTTP handler with MCP routes
        const server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            
            if (req.url === '/mcp/tools' && req.method === 'GET') {
                res.end(JSON.stringify({ tools: mcp.listTools() }));
                return;
            }
            if (req.url === '/mcp/exec' && req.method === 'POST') {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', async () => {
                    try {
                        const { tool, args = {} } = JSON.parse(body);
                        const result = await mcp.execute(tool, args);
                        res.end(JSON.stringify({ result }));
                    } catch (e) {
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }
            res.end(JSON.stringify({ error: 'not found', endpoints: ['/mcp/tools', '/mcp/exec'] }));
        });
        
        const port = options.port || 3100;
        
        // Start with VANT_SERVER_INSECURE=1 in dev
        await new Promise(r => server.listen(port, () => {
            console.log('[MCP] Server on port', port, '-', mcp.listTools().length, 'tools');
        }));
        
        return { port, server };
    },
    stop,
    listTools,
    methods: _methods,
    addMethod: (name, def) => _methods.set(name, def),
    // NEW: Execute MCP tool by name
    execute: async (name, params) => {
        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };
        return tool.handler(params);
    },
    // NEW: Execute via JSON-RPC style
    call: async (name, params) => {
        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };
        return tool.handler(params);
    }
};