/**
 * Vant MCP Server
 * 
 * Exposes Vant memory as MCP tools for AI agents.
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage:
 *   node bin/mcp.js -h|--help
 *   node bin/mcp.js -s|--stdio
 *   node bin/mcp.js -S|--server [-p|--port <port>]
 * 
 * Tools exposed (21 total):
 * Core (9):
 *   - vant_get_memory    : Read current brain state
 *   - vant_set_memory    : Write to brain (creates branch)
 *   - vant_list_branches : List brain branches
 *   - vant_create_branch : Create new brain branch
 *   - vant_switch_branch : Switch to brain branch
 *   - vant_commit        : Commit brain changes
 *   - vant_sync          : Sync with GitHub
 *   - vant_lock          : Acquire/release brain lock
 *   - vant_health         : System health
 * Extended (12):
 *   - vant_get_islands   : List islands
 *   - vant_load_island   : Load island
 *   - vant_resolution_track : Track decisions
 *   - vant_stego_encode   : Encode PNG stego
 *   - vant_stego_decode   : Decode PNG stego
 *   - vant_config_get    : Get config
 *   - vant_config_set   : Set config
 *   - vant_audit_log    : Log audit
 *   - vant_audit_list   : List audit
 *   - vant_succession_info : Trust config
 *   - vant_search       : Search brain
 *   - vant_rerank       : RAG rerank + compress
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load core Vant modules
const { env } = require('../lib/env');
const api = require('../lib/api');  // Unified API with hooks + auth

// Security chain
const vaf = require('../lib/vaf');
const { QoS } = require('../lib/qos');
const qos = new QoS();  // QoS instance for rate limiting + concurrency
const { Escrow } = require('../lib/escrow');
const { Auth } = require('../lib/auth');

// Set MCP mode for unified API (internal, no auth required)
api.setMode('mcp', { internal: true });

// Register hooks for MCP operations
api.onBeforeExecute((ctx) => {
    if (process.env.VANT_DEBUG === '1') {
        console.log('[MCP] Before execute:', ctx.type, ctx.operation?.name || 'unknown');
    }
});

api.onAfterExecute((ctx) => {
    if (process.env.VANT_DEBUG === '1') {
        console.log('[MCP] After execute:', ctx.type, 'success:', !!ctx.result);
    }
});

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
const searchLib = require('../lib/search');

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
    },
    // === Batch 2: Extended MCP Tools ===
    {
        name: 'vant_get_islands',
        description: 'List available Vant islands (lazy-loadable brain components).',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'vant_load_island',
        description: 'Load a specific island (GitHub, GitLab, Linear, Stego).',
        inputSchema: {
            type: 'object',
            properties: {
                island: { type: 'string', enum: ['github', 'gitlab', 'linear', 'stego'] }
            },
            required: ['island']
        }
    },
    {
        name: 'vant_resolution_track',
        description: 'Track thought resolution for auditability.',
        inputSchema: {
            type: 'object',
            properties: {
                thought: { type: 'string', description: 'Current thought or decision' },
                context: { type: 'string', description: 'Decision context' }
            },
            required: ['thought']
        }
    },
    {
        name: 'vant_stego_encode',
        description: 'Encode data into PNG using LSB steganography with AES-256-GCM encryption.',
        inputSchema: {
            type: 'object',
            properties: {
                data: { type: 'string', description: 'Data to encode' },
                image: { type: 'string', description: 'PNG image path' },
                password: { type: 'string', description: 'Optional encryption password' }
            },
            required: ['data']
        }
    },
    {
        name: 'vant_stego_decode',
        description: 'Decode LSB steganography from PNG.',
        inputSchema: {
            type: 'object',
            properties: {
                image: { type: 'string', description: 'PNG image path' },
                password: { type: 'string', description: 'Optional decryption password' }
            },
            required: ['image']
        }
    },
    {
        name: 'vant_config_get',
        description: 'Get Vant configuration value.',
        inputSchema: {
            type: 'object',
            properties: { key: { type: 'string', description: 'Config key (dot notation)' } },
            required: ['key']
        }
    },
    {
        name: 'vant_config_set',
        description: 'Set Vant configuration value.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Config key' },
                value: { type: 'string', description: 'Config value' }
            },
            required: ['key', 'value']
        }
    },
    {
        name: 'vant_audit_log',
        description: 'Log action to audit ledger.',
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', description: 'Action performed' },
                context: { type: 'string', description: 'Action context' },
                tags: { type: 'array', items: { type: 'string' } }
            },
            required: ['action']
        }
    },
    {
        name: 'vant_audit_list',
        description: 'List audit log entries.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number' },
                action: { type: 'string' }
            }
        }
    },
    {
        name: 'vant_succession_info',
        description: 'Get succession/trust configuration.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'vant_search',
        description: 'Search brain files. Two modes: basic (fast text search) or rag (LTC-based semantic search with context rehydration).',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                mode: { type: 'string', description: 'Search mode: "basic" (text), "rag" (semantic LTC), "hybrid" (BM25+Vector RRF)', enum: ['basic', 'rag', 'hybrid'], default: 'basic' },
                files: { type: 'array', items: { type: 'string' }, description: 'Files to search (basic mode only)' },
                limit: { type: 'number', description: 'Max results (RAG mode)', default: 5 },
                compact: { type: 'boolean', description: 'Compact mode: return summaries only, skip full rehydration (RAG mode)', default: false },
                rerank: { type: 'boolean', description: 'Rerank results after search (keyword score + compression)', default: false },
                maxTokens: { type: 'number', description: 'Max tokens for rerank compression', default: 2000 }
            },
            required: ['search-hyde']
        }
    },
    {
        name: 'vant_rerank',
        description: 'RAG rerank + compress memories. Rerank by keyword query, compress to token budget for LLM context.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Query to rerank against' },
                topK: { type: 'number', description: 'Top K results (default: 5)', default: 5 },
                maxTokens: { type: 'number', description: 'Max tokens for compression (default: 2000)', default: 2000 },
                mode: { type: 'string', description: 'Mode: rerank, compress, or pipeline', enum: ['rerank', 'compress', 'pipeline'], default: 'rerank' }
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

    // Handle files parameter
    let targetFiles = allFiles.map(f => path.basename(f, path.extname(f)));
    if (files && Array.isArray(files)) {
        // SECURITY: Validate each file before processing
        for (const file of files) {
            // Block null bytes
            if (file.includes('\0')) {
                return { error: 'Invalid filename - null bytes not allowed' };
            }
            // Block absolute paths
            if (file.startsWith('/') || file.startsWith('\\')) {
                return { error: 'Absolute paths not allowed' };
            }
            // Block parent directory refs
            if (file.includes('..')) {
                return { error: 'Parent directory references not allowed' };
            }
            
            // Validate final path is within expected directory
            const resolvedFile = path.resolve(path.join(modelPath, file));
            const resolvedPath = path.resolve(modelPath);
            if (!resolvedFile.startsWith(resolvedPath + path.sep) && resolvedFile !== resolvedPath) {
                return { error: 'Path traversal detected' };
            }
        }
        targetFiles = files;
    }
    
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
    
    // SECURITY: Basic filename validation
    // Block null bytes
    if (file.includes('\0')) {
        throw new Error('Invalid filename - null bytes not allowed');
    }
    // Block absolute paths
    if (file.startsWith('/') || file.startsWith('\\')) {
        throw new Error('Absolute paths not allowed');
    }
    // Block parent directory refs
    if (file.includes('..')) {
        throw new Error('Parent directory references not allowed');
    }
    
    // SECURITY: Validate final path is within expected directory (prevent path traversal)
    const resolvedFile = path.resolve(path.join(modelPath, `${file}.md`));
    const resolvedPath = path.resolve(modelPath);
    if (!resolvedFile.startsWith(resolvedPath + path.sep) && resolvedFile !== resolvedPath) {
        throw new Error('Path traversal detected - file must be within models/public');
    }
    
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
 * Search brain files (2-mode: basic text or RAG/LTC semantic)
 */
async function searchBrain(query, args = {}) {
    const mode = args.mode || 'basic';
    const compact = args.compact || false;
    
    // Validate query
    vaf.check(query, {
        type: 'string',
        name: 'search-hyde',
        maxLength: 500
    });
    
    if (mode === 'rag') {
        // RAG mode: use LTC-based semantic search
        let limit = args.limit || 5;
        
        // Validate limit inline (vaf doesn't support number type)
        if (typeof limit !== 'number') limit = 5;
        if (limit < 1) limit = 1;
        if (limit > 20) limit = 20;
        
        const { results, context } = await searchLib.query(query, { limit, compact });

        // Get settings for compression threshold
        const settings = searchLib.getSettings();
        const compressThreshold = settings.compressionThreshold;
        
        // Apply compression if context is large
        let compressed = null;
        if (context && context.length > compressThreshold) {
            // Compress using vpatch format
            const truncated = context.slice(0, compressThreshold);
            compressed = `[COMPRESSED:${context.length}]${truncated}...`;
        }
        
        return {
            mode: 'rag',
            query,
            results: results.length,
            hits: results.map(r => ({ type: r.type, summary: r.summary })),
            context: context || '',
            compressed,
            settings: {
                rehydrateMaxSize: settings.rehydrateMaxSize,
                compressionThreshold: compressThreshold,
                ragLimitMax: settings.ragLimitMax
            },
            ltc: searchLib.getSummary()
        };
    }

    if (mode === 'hybrid') {
        // Hybrid mode: BM25 + Vector with RRF (via unified search lib)
        const results = await searchLib.hybrid(query);
        
        // Optional: rerank results
        if (args.rerank) {
            const rerankLib = require('./lib/rerank');
            const limit = args.limit || 5;
            const maxTokens = args.maxTokens || 2000;
            
            const memories = results.fused.map(r => ({
                id: r.id,
                title: r.id?.substring(0, 20),
                content: r.content || r.summary || '',
                date: r.date || new Date().toISOString()
            }));
            
            const ranked = rerankLib.rerank(memories, query, limit);
            const compressed = rerankLib.compress(ranked, maxTokens);
            
            return {
                mode: 'hybrid',
                query,
                searchResults: results.fused.length,
                reranked: ranked.length,
                compressed: compressed.length,
                results: compressed.map(r => ({
                    id: r.title?.substring(0, 15),
                    score: r.rerankScore?.toFixed(1),
                    content: r.content?.substring(0, 80)
                }))
            };
        }
        
        return {
            mode: 'hybrid',
            query,
            sparse: results.sparse.length,
            dense: results.dense.length,
            fused: results.fused.length,
            results: results.fused.slice(0, args.limit || 5).map(r => ({
                id: r.id?.substring(0, 8),
                rrf: r.rrf?.toFixed(3),
                content: r.content?.substring(0, 100)
            }))
        };
    }

    // Basic mode: text search across files
    const files = args.files || null;
    const modelPath = 'models/public';
    
    if (!fs.existsSync(modelPath)) {
        return { error: 'Brain not found', mode: 'basic' };
    }
    
    // Get files to search
    const allFiles = fs.readdirSync(modelPath).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext);
    });
    
    let targetFiles = allFiles;
    if (files && Array.isArray(files)) {
        targetFiles = files.filter(f => {
            // Security: validate filenames
            if (f.includes('\0') || f.startsWith('/') || f.startsWith('\\') || f.includes('..')) {
                return false;
            }
            return allFiles.includes(f);
        });
    }
    
    const queryLower = query.toLowerCase();
    const hits = [];
    
    for (const file of targetFiles) {
        const filePath = path.join(modelPath, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                    hits.push({
                        file,
                        line: i + 1,
                        text: lines[i].slice(0, 200)
                    });
                    
                    if (hits.length >= 50) break; // Limit results
                }
            }
        } catch (e) {
            // Skip unreadable files
        }
        
        if (hits.length >= 50) break;
    }
    
    return {
        mode: 'basic',
        query,
        filesSearched: targetFiles.length,
        hits: hits.length,
        results: hits
    };
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
    
    // Use unified API for authentication (with lockout)
    const MCP_API_KEY = env.mcpApiKey();
    if (MCP_API_KEY) {
        // For JSON-RPC, pass key in params or use internal context
        const apiKey = reqParams.apiKey;
        const auth = api.authenticate(apiKey);
        if (!auth.allowed) {
            return { error: 'Unauthorized: ' + auth.reason };
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
                    case 'vant_search':
                        result = await protection.withTimeout(searchBrain(args.query, args));
                        break;
                    case 'vant_rerank':
                        const rerankLib = require('./lib/rerank');
                        const memories = getMemory();
                        const query = args.query || '';
                        const mode = args.mode || 'rerank';
                        const topK = args.topK || 5;
                        const maxTokens = args.maxTokens || 2000;
                        
                        if (mode === 'compress') {
                            result = { compressed: rerankLib.compress(memories, maxTokens) };
                        } else if (mode === 'pipeline') {
                            result = rerankLib.pipeline(memories, query, { topK, maxTokens });
                        } else {
                            result = { reranked: rerankLib.rerank(memories, query, topK) };
                        }
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
const isStdio = args.includes('--stdio') || args.includes('-s');
const isServer = args.includes('--server') || args.includes('-S') || args.includes('--http');

// Show help and exit
if (isHelp) {
    console.log(`
Vant MCP Server

Usage:
  node bin/mcp.js -h|--help
  node bin/mcp.js -s|--stdio
  node bin/mcp.js -S|--server [-p|--port <port>]

Options:
  -h, --help     Show this help
  -s, --stdio   Run for AI SDK stdio
  -S, --server  Start HTTP server
  -p, --port   HTTP server port (default: 3456)

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
 // Optional: VANT_MCP_API_KEY   API key for authentication
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
    
    // SECURITY: Add authentication check
const MCP_API_KEY = env.mcpApiKey();

function checkAuth(req) {
    if (!MCP_API_KEY) return true; // No key configured, allow all
    const auth = req.headers.authorization;
    if (auth === MCP_API_KEY || auth === 'Bearer ' + MCP_API_KEY) return true;
    return false;
}

const server = http.createServer(async (req, res) => {
    // Get client IP for rate limiting
    const clientIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    
    // VAF + QoS security chain
    try {
        vaf.check(req.url);  // throws on bad input
        if (vaf.isBlocked(clientIp)) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Rate limited - too many requests' }));
            return;
        }
        await qos.check(clientIp, 'read');
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
        return;
    }
    
    // Check auth for /call endpoints
    if (req.url === '/call' && !checkAuth(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
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
        const expectedKey = env.mcpApiKey() || (config ? config.get('MCP_API_KEY') : null);
        const requireApiKey = env.mcpRequireKey() === 'true' || 
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
            if (!MCP_API_KEY && requireApiKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tools: TOOLS }));
        } else if (req.url === '/health' && req.method === 'GET') {
            // Health can be public but sanitize output
            const health = await checkHealth();
            delete health.uptime; // Reduce info leak
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health));
        } else if (false) { // DISABLED - keep path

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
    
    const PORT = env.mcpPort() || 3456;
    const BIND_ADDRESS = env.mcpBindAddress();
    server.listen(PORT, BIND_ADDRESS, () => {
        console.log(`Vant MCP Server running on port ${PORT}`);
        console.log('Endpoints:');
        console.log('  GET /tools  - List available tools');
        console.log('  GET /health - Server health');
        console.log('  POST /call  - Call tool (JSON-RPC)');
    });
}

module.exports = { TOOLS, getMemory, setMemory, listBranches, createBranch, switchBranch, commitChanges, lockBrain, checkHealth, searchBrain };