/**
 * Vant MCP Server
 * 
 * Exposes Vant memory as MCP tools for AI agents.
 * 
 * Usage:
 *   node bin/mcp.js
 * 
 * Or run with --stdio for AI SDK integration:
 *   node bin/mcp.js --stdio
 * 
 * Tools exposed:
 *   - vant_get_memory    : Read current brain state
 *   - vant_set_memory    : Write to brain (creates branch)
 *   - vant_list_branches : List brain branches
 *   - vant_create_branch : Create new brain branch
 *   - vant_switch_branch : Switch to brain branch
 *   - vant_commit        : Commit brain changes
 *   - vant_sync          : Sync with GitHub
 *   - vant_lock          : Acquire/release brain lock
 *   - vant_health        : Check system health
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load core Vant modules
const loadModule = (name) => {
    try {
        return require(`../lib/${name}`);
    } catch (e) {
        return null;
    }
};

const brain = loadModule('brain');
const branch = loadModule('branch');
const lock = loadModule('lock');
const config = loadModule('config');
const health = loadModule('health');
const protection = require('../lib/protection');
const vaf = require('../lib/vaf');

/**
 * Tool definitions for MCP
 */
const TOOLS = [
    {
        name: 'vant_get_memory',
        description: 'Read current brain state from Vant. Returns identity, ego, fears, anger, joy, and other memory files.',
        inputSchema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific files to read (default: all)',
                    example: ['identity', 'ego', 'lessons']
                }
            }
        }
    },
    {
        name: 'vant_set_memory',
        description: 'Write to Vant brain. Creates a branch if one does not exist.',
        inputSchema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Memory file to write (e.g., ego, goals, lessons)',
                    example: 'lessons'
                },
                content: {
                    type: 'string',
                    description: 'Content to write',
                    example: 'Learned something new about memory persistence'
                },
                branch: {
                    type: 'string',
                    description: 'Branch name (optional, defaults to agent branch)',
                    example: 'agent-1'
                },
                commit: {
                    type: 'boolean',
                    description: 'Auto-commit after write',
                    example: true
                }
            },
            required: ['file', 'content']
        }
    },
    {
        name: 'vant_list_branches',
        description: 'List all brain branches in the Vant repository.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'vant_create_branch',
        description: 'Create a new brain branch for agent isolation.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Branch name',
                    example: 'experiment-1'
                }
            },
            required: ['name']
        }
    },
    {
        name: 'vant_switch_branch',
        description: 'Switch to a different brain branch.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Branch name to switch to',
                    example: 'agent-1'
                }
            },
            required: ['name']
        }
    },
    {
        name: 'vant_commit',
        description: 'Commit brain changes to current branch.',
        inputSchema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'Commit message',
                    example: 'Updated memory with new learnings'
                },
                branch: {
                    type: 'string',
                    description: 'Branch to commit to (optional)'
                }
            },
            required: ['message']
        }
    },
    {
        name: 'vant_sync',
        description: 'Sync brain with GitHub (pull/push).',
        inputSchema: {
            type: 'object',
            properties: {
                direction: {
                    type: 'string',
                    enum: ['push', 'pull', 'both'],
                    description: 'Sync direction',
                    example: 'push'
                }
            }
        }
    },
    {
        name: 'vant_lock',
        description: 'Acquire or release brain lock for safe multi-agent operations.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['acquire', 'release', 'status'],
                    description: 'Lock action',
                    example: 'acquire'
                },
                agentId: {
                    type: 'string',
                    description: 'Agent identifier (optional)',
                    example: 'agent-1'
                }
            },
            required: ['action']
        }
    },
    {
        name: 'vant_health',
        description: 'Check Vant system health and configuration.',
        inputSchema: {
            type: 'object',
            properties: {
                detailed: {
                    type: 'boolean',
                    description: 'Include detailed diagnostics'
                }
            }
        }
    }
];

/**
 * Read memory files from models/public
 */
async function getMemory(files = null) {
    vaf.check(files, {type: 'path', name: 'files', maxLength: 200, required: false});
    const modelPath = 'models/public';
    if (!fs.existsSync(modelPath)) {
        return { error: 'Brain not found' };
    }

    const allFiles = fs.readdirSync(modelPath).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext);
    });

    const targetFiles = files || allFiles.map(f => path.basename(f, path.extname(f)));
    const memory = {};

    for (const name of targetFiles) {
        // Try each supported extension in order of preference
        const extensions = ['.md', '.txt', '.yaml', '.yml', '.json'];
        let content = null;
        
        for (const ext of extensions) {
            const filePath = path.join(modelPath, `${name}${ext}`);
            if (fs.existsSync(filePath)) {
                content = fs.readFileSync(filePath, 'utf8');
                
                // Parse JSON/YAML
                if (ext === '.json') {
                    try { content = JSON.parse(content); } catch (e) {}
                } else if (ext === '.yaml' || ext === '.yml') {
                    try {
                        const yaml = require('yaml');
                        content = yaml.parse(content);
                    } catch (e) {}
                }
                break;
            }
        }
        
        if (content !== null) {
            memory[name] = content;
        }
    }

    return memory;
}

/**
 * Write memory file
 */
async function setMemory(file, content, branch = null, autoCommit = false) {
    vaf.check(file, {type: 'path', name: 'file', maxLength: 100});
    vaf.check(content, {type: 'string', name: 'content', maxLength: 50000});
    const modelPath = 'models/public';
    
    // Determine extension - prefer .md
    const mdFile = path.join(modelPath, `${file}.md`);
    const targetFile = fs.existsSync(mdFile) ? mdFile : path.join(modelPath, `${file}.md`);
    
    fs.writeFileSync(targetFile, content, 'utf8');
    
    let result = { file: targetFile, written: true };
    
    if (autoCommit && branch) {
        try {
            if (branch.checkout) {
                await branch.checkout(branch);
            }
            if (branch.commit) {
                await branch.commit('mcp', `Update ${file}`);
            }
            result.committed = true;
        } catch (e) {
            result.commitError = e.message;
        }
    }
    
    return result;
}

/**
 * List branches
 */
async function listBranches() {
    if (!branch || !branch.listBranches) {
        return { error: 'Branch module not available' };
    }
    try {
        return { branches: branch.listBranches() };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Create branch
 */
async function createBranch(name) {
    vaf.check(name, {type: 'string', name: 'name', maxLength: 50});
    if (!branch || !branch.create) {
        return { error: 'Branch module not available' };
    }
    try {
        branch.create(name);
        return { branch: name, created: true };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Switch branch
 */
async function switchBranch(name) {
    vaf.check(name, {type: 'string', name: 'name', maxLength: 50});
    if (!branch || !branch.checkout) {
        return { error: 'Branch module not available' };
    }
    try {
        branch.checkout(name);
        return { branch: name, switched: true };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Commit changes
 */
async function commitChanges(message, branchName = null) {
    if (!branch || !branch.commit) {
        return { error: 'Branch module not available' };
    }
    try {
        if (branchName) {
            branch.checkout(branchName);
        }
        branch.commit('mcp', message);
        return { committed: true, message };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Sync with GitHub
 */
async function syncBrain(direction = 'both') {
    // Simplified - would use lib/sync in production
    return { 
        synced: true, 
        direction,
        note: 'Git sync would use lib/sync.js'
    };
}

/**
 * Lock operations
 */
async function lockBrain(action, agentId = 'mcp') {
    if (!lock) {
        return { error: 'Lock module not available' };
    }
    try {
        if (action === 'acquire') {
            const token = await lock.acquire(agentId);
            return { acquired: !!token, token };
        } else if (action === 'release') {
            await lock.release(agentId);
            return { released: true };
        } else if (action === 'status') {
            const status = lock.isLocked ? lock.isLocked() : false;
            return { locked: status };
        }
    } catch (e) {
        return { error: e.message };
    }
    return { error: 'Unknown action' };
}

/**
 * Health check
 */
async function checkHealth(detailed = false) {
    const modelPath = 'models/public';
    const configPath = 'config.ini';
    
    const status = {
        model: fs.existsSync(modelPath),
        config: fs.existsSync(configPath),
        lib: fs.existsSync('lib'),
        bin: fs.existsSync('bin')
    };
    
    if (detailed && fs.existsSync(modelPath)) {
        const files = fs.readdirSync(modelPath);
        status.memoryFiles = files.length;
        status.files = files;
    }
    
    return status;
}

/**
 * Handle MCP request
 */
async function handleRequest(request) {
    // VAF pre-check
    const params = request.params || {};
    if (params.arguments) {
        const args = params.arguments;
        
        // Validate memory write content
        if (args.content) {
            try {
                vaf.check(args.content, {
                    type: 'string',
                    name: 'content',
                    maxLength: 50000
                });
            } catch (e) {
                return { error: 'Security check failed: ' + e.message };
            }
        }
        
        // Validate file names
        if (args.file) {
            try {
                vaf.check(args.file, {
                    type: 'path',
                    name: 'file'
                });
            } catch (e) {
                return { error: 'Security check failed: ' + e.message };
            }
        }
        
        // Validate branch names
        if (args.name) {
            try {
                vaf.check(args.name, {
                    type: 'string',
                    name: 'branch',
                    maxLength: 100,
                    pattern: /^[a-zA-Z0-9_\-]+$/
                });
            } catch (e) {
                return { error: 'Security check failed: ' + e.message };
            }
        }
        
        // Validate commit message
        if (args.message) {
            try {
                vaf.check(args.message, {
                    type: 'string',
                    name: 'message',
                    maxLength: 100000
                });
            } catch (e) {
                return { error: 'Security check failed: ' + e.message };
            }
        }
    }
    
    if (protection.isCircuitOpen()) {
        return { error: 'Circuit open: too many failures. Wait and retry.' };
    }
    if (!protection.canProceed()) {
        return { error: 'Server busy: max ' + protection.MAX_CONCURRENT + ' concurrent requests' };
    }
    protection.incrementActive();
    const { method, params: reqParams = {} } = request;
    try {
        switch (method) {
            case 'tools/list':
                return { tools: TOOLS };
            case 'tools/call':
                const { name, arguments: args = {} } = params;
                if (name === 'vant_set_memory' && args.content) {
                    protection.checkInputSize(args.content);
                }
                let result;
                switch (name) {
                    case 'vant_get_memory':
                        result = await protection.withTimeout(getMemory(args.files));
                        break;
                    case 'vant_set_memory':
                        result = await protection.withTimeout(setMemory(args.file, args.content, args.branch, args.commit));
                        break;
                    case 'vant_list_branches':
                        result = await protection.withTimeout(listBranches());
                        break;
                    case 'vant_create_branch':
                        result = await protection.withTimeout(createBranch(args.name));
                        break;
                    case 'vant_switch_branch':
                        result = await protection.withTimeout(switchBranch(args.name));
                        break;
                    case 'vant_commit':
                        result = await protection.withTimeout(commitChanges(args.message, args.branch));
                        break;
                    case 'vant_sync':
                        result = await protection.withTimeout(syncBrain(args.direction), 60000);
                        break;
                    case 'vant_lock':
                        result = await protection.withTimeout(lockBrain(args.action, args.agentId));
                        break;
                    case 'vant_health':
                        result = await protection.withTimeout(checkHealth(args.detailed));
                        break;
                    case 'vant_protection':
                        result = protection.getStatus();
                        break;
                    default:
                        result = { error: 'Unknown tool: ' + name };
                }
                // Record failures for error results (not just exceptions)
                if (result && result.error) {
                    protection.recordFailure();
                }
                return result;
            default:
                return { error: 'Unknown method: ' + method };
        }
    } catch (e) {
        protection.recordFailure();
        return { error: e.message };
    } finally {
        protection.decrementActive();
    }
}


/**
 * JSON-RPC message handler
 */
async function handleMessage(msg) {
    try {
        const request = JSON.parse(msg);
        const response = await handleRequest(request);
        return JSON.stringify({ id: request.id, result: response });
    } catch (e) {
        return JSON.stringify({ 
            id: null, 
            error: { message: e.message } 
        });
    }
}

// Run mode
const args = process.argv.slice(2);
const isHelp = args.includes('--help') || args.includes('-h');
const isStdio = args.includes('--stdio');
const isServer = args.includes('--server') || args.includes('--http');

// Show help and exit
if (isHelp) {
    console.log(`
Vant MCP Server

Usage:
  node bin/mcp.js              # Run in background mode
  node bin/mcp.js --server     # Start HTTP server
  node bin/mcp.js --stdio     # Run for AI SDK stdio
  node bin/mcp.js --help      # Show this help

HTTP Endpoints:
  GET  /tools   List available tools
  GET  /health  Server health check
  POST /call    Execute tool (JSON-RPC)

Examples:
  # Start server
  node bin/mcp.js --server

  # List tools
  curl http://localhost:3456/tools

  # Call tool
  curl -X POST http://localhost:3456/call \\
    -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"vant_health"},"id":1}'

Environment:
  VANT_MCP_PORT    Server port (default: 3456)
  VANT_MCP_API_KEY  API key for auth (optional but recommended)

Authentication:
  If VANT_MCP_API_KEY is set, include in requests:
  curl -H "X-API-Key: your-key" http://localhost:3456/...
`);
    process.exit(0);
}

// Only start HTTP server when run directly with --server flag
if ((!module.parent || isServer) && !isStdio) {
    const http = require('http');
    
    const server = http.createServer(async (req, res) => {
        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        // API Key auth check
        const expectedKey = process.env.VANT_MCP_API_KEY || (config ? config.get('MCP_API_KEY') : null);
        const requireApiKey = process.env.VANT_MCP_REQUIRE_API_KEY === 'true' || 
                             (config ? config.get('MCP_REQUIRE_API_KEY') === 'true' : false);
        
        // If key is set OR required, enforce auth
        if (expectedKey || requireApiKey) {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || apiKey !== expectedKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized - provide X-API-Key header' }));
                return;
            }
        }
        
        if (req.url === '/tools' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tools: TOOLS }));
        } else if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(await checkHealth()));
        } else if (req.url === '/call' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const request = JSON.parse(body);
                    const response = await handleRequest(request);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ id: request.id, result: response }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ id: null, error: { message: e.message } }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    
    const PORT = process.env.VANT_MCP_PORT || 3456;
    server.listen(PORT, () => {
        console.log(`Vant MCP Server running on port ${PORT}`);
        console.log('Endpoints:');
        console.log('  GET /tools  - List available tools');
        console.log('  GET /health - Server health');
        console.log('  POST /call  - Call tool (JSON-RPC)');
    });
}

module.exports = { TOOLS, getMemory, setMemory, listBranches, createBranch, switchBranch, commitChanges, lockBrain, checkHealth };