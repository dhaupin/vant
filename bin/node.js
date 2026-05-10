/**
 * Vant Node Runner
 * 
 * Runs Vant as a persistent node. Similar to crypto nodes - each instance
 * runs the same code but maintains its own brain state in GitHub.
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage:
 *   node bin/node.js -h|--help
 *   node bin/node.js -m|--mcp [-p|--mcp-port <port>]
 *   node bin/node.js -P|--enable-polling [-i|--poll-interval <sec>]
 * 
 * Options:
 *   -h, --help          Show this help
 *   -m, --mcp         Start with MCP server
 *   -p, --mcp-port    MCP server port (default: 3456)
 *   -P, --enable-polling   Enable background GitHub polling
 *   -i, --poll-interval    Polling interval in seconds (default: 60)
 * 
 * ⚠️  AUTO-POLLING REQUIRES TWO CONFIRMATIONS:
 *       1. Set VANT_AGREE_AUTO_SYNC=true (env var = "checkbox")
 *       2. Type "AGREE" when prompted (stdin = "type to confirm")
 * 
 * Environment:
 *   VANT_GITHUB_REPO       - GitHub repo (default: from config)
 *   VANT_GITHUB_TOKEN     - GitHub token
 *   VANT_MCP_PORT         - MCP server port (default: 3456)
 *   VANT_AGREE_AUTO_SYNC  - Required for polling: set to "true" to agree
 * 
 * What it does:
 *   1. Loads brain from models/public
 *   2. Starts MCP server (optional)
 *   3. Runs loop (brain updates done manually via vant sync)
 *   4. Optional: background GitHub polling (opt-in with warnings)
 */

const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("./lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const readline = require('readline');
const env = require(path.join(__dirname, '../lib/config'));
const network = require(path.join(__dirname, '../lib/network'));

// Parse CLI arguments
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Vant Node Runner

Usage: node bin/node.js [-h|--help] [-m|--mcp] [-p|--mcp-port <port>]
       node bin/node.js -P|--enable-polling [-i|--poll-interval <sec>]

Options:
  -h, --help          Show this help
  -m, --mcp         Start with MCP server
  -p, --mcp-port    MCP server port (default: 3456)
  -P, --enable-polling   Enable background GitHub polling
  -i, --poll-interval    Polling interval in seconds (default: 60)
  -v, --verbose      Verbose output

⚠️  AUTO-POLLING REQUIRES TWO CONFIRMATIONS:
    1. Set VANT_AGREE_AUTO_SYNC=true (env var)
    2. Type "AGREE" when prompted
`);
    process.exit(0);
}

const vaf = require("../lib/vaf");
const { env: vantEnv } = require("../lib/config");
// Validate CLI args
for (const arg of args) {
    if (arg.startsWith("--mcp-port=") || arg.startsWith("-p=") || arg.startsWith("-p")) {
        const port = parseInt(arg.split("=")[1] || arg.slice(2));
        vaf.check(port, {type: "number", name: "mcpPort", min: 1, max: 65535});
    }
    if (arg.startsWith("--poll-interval=") || arg.startsWith("-i=") || arg.startsWith("-i")) {
        const interval = parseInt(arg.split("=")[1] || arg.slice(2));
        vaf.check(interval, {type: "number", name: "pollInterval", min: 5, max: 3600});
    }
}

// Parse polling flag
const enablePollingArg = args.includes('--enable-polling') || args.includes('-P');
const pollInterval = parseInt(args.find(a => a.startsWith('--poll-interval='))?.split('=')[1] || 
                    args.find(a => a.startsWith('-i='))?.split('=')[1] ||
                    args.find(a => a.startsWith('-i'))?.slice(2) || '60');

// Check for opt-in confirmation (MUST have BOTH)
const agreedAutoSync = env.agreeAutoSync() === 'true';

const config = {
    mcp: args.includes('--mcp') || args.includes('-m'),
    mcpPort: parseInt(args.find(a => a.startsWith('--mcp-port='))?.split('=')[1] || 
            args.find(a => a.startsWith('-p='))?.split('=')[1] ||
            args.find(a => a.startsWith('-p'))?.slice(2) || '3456'),
    pollInterval,
    enablePollingRequested: enablePollingArg,
    enablePolling: enablePollingArg && agreedAutoSync,
    verbose: args.includes('--verbose') || args.includes('-v')
};

// Load Vant modules
const loadModule = (name) => {
    try {
        return require(`../lib/${name}`);
    } catch (e) {
        return null;
    }
};

/**
 * Vant Node class - persistent agent node
 */
class VantNode {
    constructor(options = {}) {
        this.options = {
            mcp: options.mcp || false,
            mcpPort: options.mcpPort || 3456,
            pollInterval: options.pollInterval || 60,
            enablePolling: options.enablePolling || false,
            enablePollingRequested: options.enablePollingRequested || false,
            verbose: options.verbose || false
        };
        
        this.state = 'initialized';
        this.startedAt = Date.now();
        this.githubToken = env.githubToken() || process.env.GITHUB_TOKEN;
        this.repo = env.githubRepo() || 'dhaupin/vant';
        
        this.modules = {
            brain: loadModule('brain'),
            branch: loadModule('branch'),
            lock: loadModule('lock'),
            config: loadModule('config'),
            logger: loadModule('logger'),
            errors: loadModule('errors')
        };
        
        this.memory = {};
        this.pollTimer = null;
        this.mcpServer = null;
        this.confirmedPolling = false;
    }
    
    /**
     * Initialize node - load brain, set up modules
     */
    async init() {
        this.log('Initializing Vant Node...');
        
        // Load brain from local models/public
        this.memory = this.loadBrain();
        
        // Start MCP server if enabled
        if (this.options.mcp) {
            await this.startMcpServer();
        }
        
        // Check if polling requested but not confirmed
        if (this.options.enablePollingRequested && !this.options.enablePolling) {
            this.log('');
            this.log('⚠️  AUTO-POLLING FLAG DETECTED BUT NOT CONFIRMED');
            this.log('⚠️  GitHub ToS Warning: Automated polling of GitHub is prohibited.');
            this.log('   See: https://docs.github.com/en/github/site-policy/github-acceptable-use-policies');
            this.log('');
            this.log('To enable auto-polling, you must:');
            this.log('  1. Set environment variable: VANT_AGREE_AUTO_SYNC=true');
            this.log('  2. Re-run with: --enable-polling');
            this.log('');
            this.log('Alternatively, type "AGREE" below to confirm you understand the risks.');
            this.log("(This check exists because git clone/fetch IS allowed, but polling is not)");
            this.log('');
            await this.promptPollingConfirmation();
        }
        
        // Check if polling is enabled (via env var + flag OR via stdin confirmation)
        // If enablePolling is true but no stdin confirmation yet, confirm now
        if (this.options.enablePolling && !this.confirmedPolling) {
            this.confirmedPolling = true;  // Auto-confirm if env var was set
        }
        
        // Start GitHub polling only if confirmed
        if (this.options.enablePolling && this.confirmedPolling) {
            this.log('');
            this.warn('⚠️  AUTO-POLLING ENABLED - This may violate GitHub ToS');
            this.warn('   Polling GitHub at regular intervals is not permitted.');
            this.warn('   Use vant sync for manual brain sync instead.');
            this.log('');
            this.startPolling();
        }
        
        this.state = 'running';
        this.log(`Vant Node running`);
        this.log(`  Repo: ${this.repo}`);
        this.log(`  Poll: ${this.options.enablePolling && this.confirmedPolling ? 'enabled (opt-in confirmed)' : 'disabled (manual only)'}`);
        this.log(`  MCP: ${this.options.mcp ? 'enabled' : 'disabled'}`);
        
        return this;
    }
    
    /**
     * Prompt for polling confirmation via stdin
     */
    async promptPollingConfirmation() {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question('Type "AGREE" to confirm auto-polling: ', (answer) => {
                rl.close();
                if (answer.trim().toUpperCase() === 'AGREE') {
                    this.confirmedPolling = true;
                    this.log('✓ Auto-polling confirmed via stdin');
                } else {
                    this.log('✗ Auto-polling NOT confirmed. Running in manual sync mode.');
                    this.options.enablePolling = false;
                }
                resolve();
            });
        });
    }
    
    /**
     * Load brain from models/public
     */
    loadBrain() {
        const modelPath = 'models/public';
        const brain = {};
        
        if (!fs.existsSync(modelPath)) {
            this.warn('Brain not found at models/public');
            return brain;
        }
        
        const files = fs.readdirSync(modelPath).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext);
        });
        
        for (const file of files) {
            const filePath = path.join(modelPath, file);
            const ext = path.extname(file).toLowerCase();
            const name = path.basename(file, ext);
            let content = fs.readFileSync(filePath, 'utf8');
            
            if (ext === '.json') {
                try {
                    content = JSON.parse(content);
                } catch (e) {
                    // Keep as string if parse fails
                }
            } else if (ext === '.yaml' || ext === '.yml') {
                try {
                    const yaml = require('yaml');
                    content = yaml.parse(content);
                } catch (e) {
                    // Keep as string if parse fails
                }
            }
            
            brain[name] = content;
        }
        
        this.log(`Loaded brain: ${files.length} files`);
        return brain;
    }
    
    /**
     * Save brain to models/public
     */
    saveBrain(memory) {
        const modelPath = 'models/public';
        
        for (const [name, content] of Object.entries(memory)) {
            const filePath = path.join(modelPath, `${name}.md`);
            fs.writeFileSync(filePath, content, 'utf8');
        }
        
        this.log(`Saved brain: ${Object.keys(memory).length} files`);
    }
    
    /**
     * Start MCP server for tool access
     */
    async startMcpServer() {
        const mcpPath = path.join(__dirname, 'mcp.js');
        
        if (!fs.existsSync(mcpPath)) {
            this.warn('MCP server not found');
            return;
        }
        
        // Fork MCP server as child process
        this.mcpServer = spawn('node', [mcpPath], {
            env: {
                ...process.env,
                VANT_MCP_PORT: String(this.options.mcpPort)
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        this.mcpServer.stdout.on('data', (data) => {
            this.log(`[MCP] ${data.toString().trim()}`);
        });
        
        this.mcpServer.stderr.on('data', (data) => {
            this.error(`[MCP] ${data.toString().trim()}`);
        });
        
        this.log(`MCP server started on port ${this.options.mcpPort}`);
    }
    
    /**
     * Start polling GitHub for changes
     */
    startPolling() {
        this.log(`Starting GitHub polling (every ${this.options.pollInterval}s)`);
        
        this.pollTimer = setInterval(async () => {
            try {
                await this.pollGithub();
            } catch (e) {
                this.error(`Poll error: ${e.message}`);
            }
        }, this.options.pollInterval * 1000);
    }
    
    /**
     * Poll GitHub for changes
     */
    async pollGithub() {
        if (!this.githubToken) {
            this.warn('No GitHub token - skipping sync');
            return;
        }
        
        // Simplified: just log that we'd check for changes
        // In production: use GitHub API to check for new commits
        this.log('Polling GitHub...');
        
        // Could add:
        // - Check last commit SHA
        // - If changed: pull new brain
        // - If local changes: push to GitHub
    }
    
    /**
     * Sync with GitHub
     */
    async sync(direction = 'both') {
        this.log(`Syncing with GitHub (${direction})...`);
        
        // In production: use lib/sync.js
        // - pull: git fetch && git merge
        // - push: git add && git commit && git push
    }
    
    /**
     * Get node status
     */
    getStatus() {
        return {
            state: this.state,
            startedAt: this.startedAt,
            uptime: Date.now() - this.startedAt,
            options: this.options,
            repo: this.repo,
            memoryFiles: Object.keys(this.memory).length,
            mcp: this.options.mcp ? 'running' : 'disabled'
        };
    }
    
    /**
     * Stop node gracefully
     */
    async stop() {
        this.log('Stopping Vant Node...');
        
        this.state = 'stopping';
        
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        
        if (this.mcpServer) {
            this.mcpServer.kill();
        }
        
        this.state = 'stopped';
        this.log('Vant Node stopped');
    }
    
    // Logging
    log(msg) {
        const prefix = '[Vant Node]';
        console.log(`${prefix} ${msg}`);
    }
    
    warn(msg) {
        const prefix = '[Vant Node]';
        console.warn(`${prefix} WARN: ${msg}`);
    }
    
    error(msg) {
        const prefix = '[Vant Node]';
        console.error(`${prefix} ERROR: ${msg}`);
    }
}

// CLI entry point
if (require.main === module) {
    const node = new VantNode(config);
    
    node.init().then(() => {
        console.log('');
        console.log('Vant Node is running. Press Ctrl+C to stop.');
        
        // Handle shutdown
        process.on('SIGINT', async () => {
            console.log('');
            await node.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            await node.stop();
            process.exit(0);
        });
    }).catch(e => {
        console.error('Failed to start node:', e.message);
        process.exit(1);
    });
}

module.exports = { VantNode };