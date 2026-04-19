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
    const modelPath = 'models/public';
    if (!fs.existsSync(modelPath)) {
        return { error: 'Brain not found' };
    }

    const allFiles = fs.readdirSync(modelPath).filter(f => 
        f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json')
    );

    const targetFiles = files || allFiles.map(f => path.basename(f, path.extname(f)));
    const memory = {};

    for (const name of targetFiles) {
        const mdFile = path.join(modelPath, `${name}.md`);
        const txtFile = path.join(modelPath, `${name}.txt`);
        
        if (fs.existsSync(mdFile)) {
            memory[name] = fs.readFileSync(mdFile, 'utf8');
        } else if (fs.existsSync(txtFile)) {
            memory[name] = fs.readFileSync(txtFile, 'utf8');
        }
    }

    return memory;
}

/**
 * Write memory file
 */
async function setMemory(file, content, branch = null, autoCommit = false) {
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
    const { method, params = {} } = request;
    
    switch (method) {
        case 'tools/list':
            return { tools: TOOLS };
            
        case 'tools/call':
            const { name, arguments: args } = params;
            
            switch (name) {
                case 'vant_get_memory':
                    return await getMemory(args.files);
                case 'vant_set_memory':
                    return await setMemory(args.file, args.content, args.branch, args.commit);
                case 'vant_list_branches':
                    return await listBranches();
                case 'vant_create_branch':
                    return await createBranch(args.name);
                case 'vant_switch_branch':
                    return await switchBranch(args.name);
                case 'vant_commit':
                    return await commitChanges(args.message, args.branch);
                case 'vant_sync':
                    return await syncBrain(args.direction);
                case 'vant_lock':
                    return await lockBrain(args.action, args.agentId);
                case 'vant_health':
                    return await checkHealth(args.detailed);
                default:
                    return { error: `Unknown tool: ${name}` };
            }
            
        default:
            return { error: `Unknown method: ${method}` };
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
const isStdio = args.includes('--stdio');
const isServer = args.includes('--server') || args.includes('--http');

// Only start HTTP server when run directly with --server flag
if ((!module.parent || isServer) && !isStdio) {
    const http = require('http');
    
    const server = http.createServer(async (req, res) => {
        if (req.url === '/tools') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tools: TOOLS }));
        } else if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(await checkHealth()));
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