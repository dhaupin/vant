#!/usr/bin/env node
const vaf = require("../lib/vaf");
const version = require('../lib/version');
/**
 * vant CLI - Command aliases
 *
 * Usage: vant <command> [args]
 *
 * Commands:
 *   vant start        - Full startup (health → sync → load → run)
 *   vant start --distributed - Start as distributed agent node
 *   vant sync         - Pull/push brain from/to GitHub
 *   vant health       - System diagnostics and model check
 *   vant load         - Load brain from models/private
 *   vant run          - Start runtime (long-running agent loop)
 *   vant test        - Run build tests
 *   vant changelog   - View recent changes
 *   vant summary     - Session summary - memory, state, stats
 *   vant watch       - Monitor GitHub for changes (poll)
 *  vant help        - Show help (this command)
 *   vant setup       - Interactive setup wizard
 *   vant update      - Check for new Vant releases
 *   vant rate        - Show GitHub API rate limit
 *   vant bump       - Bump version and tag release
 *   vant docs       - Build docs for release
 *   vant node       - Run as persistent node
 *   vant mcp        - Run MCP server for AI tools
 */

const { spawn } = require('child_process');
const path = require('path');

const BIN_DIR = __dirname;

// DISTRIBUTED: Start as distributed agent node
async function distributed(args) {
    console.log(`╔═══════════════════════════════════════╗`);
    console.log(`║    Vant Distributed Agent Node        ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    
    const vant = require('../lib/vant');
    
    // Initialize as distributed
    console.log('\n→ Initializing OS...');
    vant.runop({ distributed: true, layers: { registry: true, consensus: true } });
    
    // Register this node
    const registry = vant.registry();
    const nodeId = 'agent_' + Math.random().toString(36).slice(2, 8);
    registry.register({ name: nodeId, host: 'localhost', port: 3100, status: 'alive' });
    console.log('✓ Registered:', nodeId);
    
    // Check peers (if any)
    const peers = registry.discover();
    console.log('✓ Discovered peers:', peers.length);
    
    // Ready for consensus
    const c = vant.consensus();
    const stats = c.getStats();
    console.log('✓ Consensus:', stats.total, 'votes');
    
    console.log(`\n🤖 Distributed Agent Ready!\n`);
    console.log('  Registry:', nodeId);
    console.log('  Peers:   ', peers.length);
    console.log('  Consensus:', stats.total, 'votes\n');
    
    return { nodeId, peers, status: 'ready' };
}

// CLI commands
const COMMANDS = {
    // Core
    start: 'start.js',
    sync: 'sync.js',
    health: 'health.js',
    load: 'load.js',
    run: 'run.js',
    test: 'test-core.js',
    
    // Distributed
    distributed: null,  // Special handler
    
    // Server
    server: 'server.js',
    
    // Changelog & docs
    changelog: 'changelog.js',
    docs: 'docs.js',
    
    // Utilities
    summary: 'summary.js',
    update: 'update.js',
    watch: 'watch.js',
    bump: 'bump.js',
    
    // Help & info
    help: 'help.js',
    
    // Server modes
    node: 'node.js',

    // Trifecta modes (via vant.startFull)
    mcp: null,  // handled inline
    api: null,  // handled inline
    all: null,  // handled inline
    
    // Onboarding
    onboard: 'onboard.js',
    
    // Settings
    setup: 'setup.js',
    rate: 'rate.js',
    
    // Branching
    resolution: 'resolution.js',
    succession: 'succession.js',
    
    // Advanced
    bot: 'bot.js',
    compress: 'compress.js',
    
    // Brain
    stego: 'stego.js',
    
    // Automation
    prune: 'prune.js',
    vibe: 'vibe.js',
    repos: 'repos.js',
    hybrid: 'hybrid-sync.js',
    search: 'search.js',
    rerank: 'rerank.js',
    validate: 'validate.js',
    
    // Ghost in the Machine
    boot: 'boot.js',
    
    // Islands (componentized brain)
    islands: 'islands.js',
    
    // Brain lock management
    lock: 'lock.js',
    
    // Config get/set
    config: 'config.js',
    
    // Brain horcrux (backup/restore)
    horcrux: 'brain-horcrux.js',
    
    // Agent spawning
    spawn: 'agent-spawner.js',
    
    // Audit & Metrics
    audit: 'audit.js',
    
    // Branch management
    branch: 'branch-manager.js',
    
    // System utilities
    canvas: 'canvas.js',
    compute: 'compute.js',
    embed: 'embed.js',
    format: 'format.js',
    metrics: 'metrics.js',
    rls: 'rls.js',
    system: 'system.js',
    
    // Brain & Geometry
    brain: 'brain.js',
    geometry: 'geometry.js',
    duality: 'geometry.js',
    
    // Additional utilities
    audit: 'audit.js',
    branch: 'branch-manager.js',
    repos: 'repos.js',
    
    // Ecosystem management
    skills: 'skills.js',
    cache: 'cache.js',
    cron: 'cron.js',
    connector: 'connector.js',
    lineage: 'lineage.js',
    remote: 'remote.js',
    
    // System operations
    msg: 'msg.js',
    nodes: 'nodes.js',
    storage: 'storage.js',
    encrypt: 'encrypt.js',
    
    // Additional system
    schema: 'schema.js',
    event: 'event.js',
    network: 'network.js',
    theme: 'theme.js',
    
    // System utilities
    auth: 'auth.js',
    citations: 'citations.js',
    consensus: 'consensus.js',
    framework: 'framework.js',
    habitat: 'habitat.js',
    legal: 'legal.js',
    qos: 'qos.js',
    rules: 'rules.js',
    runop: 'runop.js',
    sandbox: 'sandbox.js',
    security: 'security.js',
    shell: 'shell.js',
    stream: 'stream.js',
    sudo: 'sudo.js',
    telegram: 'telegram.js',
    tmp: 'tmp.js',
    vaf: 'vaf.js',
    
    // Core modules
    agents: 'agents.js',
    api: 'api.js',
    error: 'error.js',
    escrow: 'escrow.js',
    nature: 'nature.js'
};

const args = process.argv.slice(2);
const cmd = args[0];
if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});

// Handle: vant help <cmd>
if (cmd === 'help' && args[1]) {
    const { spawn } = require('child_process');
    // Validate command name to prevent injection
    const helpCmd = args[1].replace(/[^a-zA-Z0-9_-]/g, '');
    const child = spawn('node', ['bin/help.js', helpCmd], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code || 0));
}

// Handle learn/remember commands directly
if (cmd === 'learn' || cmd === 'remember') {
    const vant = require('../lib/vant');
    
    // Parse args: extract --ttl first, rest is key + content
    let key = null;
    let content = '';
    let ttl = null;
    
    const rawArgs = args.slice(1);
    const finalArgs = [];
    
    for (let i = 0; i < rawArgs.length; i++) {
        if (rawArgs[i] === '--ttl' && rawArgs[i + 1]) {
            ttl = parseInt(rawArgs[i + 1], 10);
            i++; // skip TTL value
        } else {
            finalArgs.push(rawArgs[i]);
        }
    }
    
    key = finalArgs[0] || null;
    content = finalArgs.slice(1).join(' ');
    
    if (!key) {
        console.error(`Usage: vant ${cmd} <key> [content] [--ttl milliseconds]`);
        console.error(`Example: vant learn mykey "some content" --ttl 3600000`);
        process.exit(1);
    }
    
    (async () => {
        try {
            await vant.init({ debug: false });
            
            if (cmd === 'learn') {
                const options = ttl ? { ttl } : {};
                const result = await vant.learn(key, content || '', options);
                console.log(`✅ Learned: ${key}`, result.ttl ? `(TTL: ${result.ttl}ms)` : '');
            } else {
                // remember
                if (content) {
                    // Store
                    const options = ttl ? { ttl } : {};
                    const result = await vant.remember(key, content, options);
                    console.log(`✅ Remembered: ${key}`, result.ttl ? `(TTL: ${result.ttl}ms)` : '');
                } else {
                    // Recall
                    const result = await vant.remember(key);
                    console.log(result || '(not found)');
                }
            }
            process.exit(0);
        } catch (e) {
            console.error('Error:', e.message);
            process.exit(1);
        }
    })();
    return;
}

if (!cmd || cmd === 'help' || cmd === 'vant') {
    console.log(`
╔═══════════════════════════════════════╗
║         vant CLI v${version}              ║
╚═══════════════════════════════════════╝

Usage: vant <command> [options]

Core:
  vant start        Full startup (health → sync → load → run)
  vant health      System diagnostics
  vant sync        Pull/push brain
  vant load       Load brain
  vant run        Long-running agent loop
  vant version     Show version (-v, --version)

Additional:
  vant audit     Security audit
  vant branch    Branch management
  vant repos     External repo management

Ecosystem:
  vant skills    Skill management
  vant cache    Cache/compression
  vant cron     Cron job scheduler
  vant connector External services
  vant lineage  Trace/audit trail
  vant remote   Remote operations

System:
  vant msg      Messaging system
  vant nodes    Peer discovery
  vant storage  Storage operations
  vant encrypt  Encryption utilities
  vant schema   Schema validation
  vant event    Event handling
  vant network  Network operations
  vant theme    Theme management

Memory:
  vant learn <key> <content> [--ttl ms]  Store learning
  vant remember <key> [content] [--ttl ms]  Store/recall memory

Development:
  vant test         Run smoke tests
  vant test core    Run core test suite
  vant test full    Run all tests (500+)
  vant validate    Schema + audit + circuits
  vant changelog   View changes

Sync:
  vant repos       Mount external repos
  vant hybrid     Public/Private split sync
  vant search    Search (basic|rag|hybrid|hyde + rerank)
  vant rerank    Rerank (query|compress|pipeline)

Brain:
  vant onboard     Browse brain files
  vant islands    Componentized brain boot
  vant prune      Prune brain (LTC generation)
  vant succession Trust levels
  vant resolution Thought resolution
  vant lock       Brain write lock (acquire/release/status)
  vant horcrux    Backup/restore brain to images
  vant stego      Stego brain recovery

State:
  vant vibe        Show/set vibe
  vant watch      Poll GitHub for changes
  vant summary    Session stats

Integrations:
  vant mcp        MCP server for AI tools
  vant node       Persistent node
  vant webhook   Webhook server + send
  vant server     HTTP/HTTPS server with security chain

Utilities:
  vant canvas     Visualization tools
  vant compute   Multi-language runner
  vant embed     Embedding/vector ops
  vant format    Format detection
  vant metrics   Metrics dashboard
  vant rls       Row-level security
  vant system    System diagnostics

System Utilities:
  vant auth       Authentication
  vant citations  Citation management
  vant consensus  Consensus mechanisms
  vant framework  Framework utilities
  vant habitat    Environment management
 vant legal       Legal/compliance
  vant qos        Quality of Service
  vant rules      Rule management
  vant runop      Run operations
  vant sandbox    Sandbox management
  vant security   Security utilities
  vant shell      Shell operations
  vant stream     Stream operations
  vant sudo      Privilege management
  vant telegram   Telegram bot
  vant tmp        Temp file management
  vant vaf        Validation framework

Core:
  vant agents     Agent management
  vant api        API utilities
  vant error      Error handling
  vant escrow     Escrow operations
  vant nature     Nature module

Brain:
  vant brain mode <mode>  Set brain mode (dual/public/private/remote)
  vant geometry          Brain-Quasicrystal duality bridge
  vant duality          Alias for geometry

Auth:
  MCP requires API key if VANT_MCP_REQUIRE_KEY=true.
  Set: vant config set mcp.requireKey true
  Key:  vant config set mcp.apiKey "your-secret-key"
  Or:   export VANT_MCP_API_KEY=your-secret-key
  Env:  export VANT_MCP_REQUIRE_KEY=true
  Use:  Header X-API-Key: <key> or Authorization: Bearer <key>

TTL:
  Use --ttl flag with learn/remember to auto-expire entries:
    vant learn key "content" --ttl 60000
    vant remember key --ttl 3600000
  Result includes { ttl, expiresAt } fields

Resolution:
  Track thought resolutions:
    vant resolution status     Show all resolutions
    vant resolution resolve   Mark as resolved
    vant resolution reject    Mark as rejected

Headless:
  Use Vant as library without MCP:
    const vant = require('../lib/vant');
    await vant.startHeadless({ port: 3000 });
  Or: export VANT_MODE=headless

  vant notify    Send notifications
  vant linear   Linear issue tracking (requires island)

Config:
  vant config get <key>   Get config value
  vant config set <key> <value>  Set config value

Maintenance:
  vant boot       Ghost boot (stego image)
  vant stego      Encode/decode brain in images
  vant bump      Bump version + tag release
  vant update     Check for updates
  vant rate      Show GitHub rate limit

Setup:
  vant setup     Interactive wizard
  vant help      Show help (this message)
`);
    process.exit(0);
}

const script = COMMANDS[cmd];
if (!script) {
    // Built-in commands
    if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
        const vant = require('../lib/vant');
        console.log('vant CLI v' + vant.version);
        process.exit(0);
    }
    if (cmd === 'distributed') {
        // Special handler
        distributed(process.argv.slice(3)).then(r => {
            console.log(r);
            process.exit(0);
        }).catch(e => {
            console.error(e);
            process.exit(1);
        });
    } else if (cmd === 'mcp' || cmd === 'api' || cmd === 'all') {
        // Trifecta mode handler
        const mode = cmd;
        const vant = require('../lib/vant');
        vant.startFull({ mode, debug: true }).then(r => {
            console.log(`✓ Started in ${mode} mode`);
            console.log('  Ports:', r.ports);
            console.log('  Status:', r.status);
            console.log('\n🛑 Press Ctrl+C to stop\n');
        }).catch(e => {
            console.error('Failed to start:', e.message);
            process.exit(1);
        });
    } else {
        console.error('Unknown command:', cmd);
        process.exit(1);
    }
    return;
}

const scriptPath = path.join(BIN_DIR, script);
const child = spawn('node', [scriptPath, ...process.argv.slice(3)], {
    stdio: 'inherit',
    cwd: path.dirname(__dirname)
});

child.on('exit', (code) => process.exit(code || 0));