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
    vant.init({ distributed: true, layers: { registry: true, consensus: true } });
    
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

    // All-mode servers (via vant.startFull)
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
    repos: 'repos.js',
    hybrid: 'hybrid-sync.js',
    search: 'search.js',
    rerank: 'rerank.js',
    validate: 'validate.js',
    
    // Ghost in the Machine
    boot: 'boot.js',
    
    // Islands (componentized brain)
    islands: 'islands.js',
    
    // Relay (the headless Mode R posture - prd-relay.md v0.2 §1.1)
    relay: 'relay.js',
    // The Traveler + its certified letter (passes 255-261; cli.md §table)
    traveler: 'traveler.js',
    // The carrier lanes (roster/plates/encode/decode — the ops surface for
    // the certified letter's transport lanes)
    carrier: 'carrier.js',
    
    // Brain lock management
    lock: 'lock.js',
    
    // Config get/set
    config: 'config.js',
    
    // Brain horcrux (backup/restore)
    horcrux: 'horcrux.js',
    
    // Era — the resumable incarnation ledger (issues #177-#179)
    era: 'era.js',
    
    // Brain layout migrations (prd-storage.md)
    migrate: 'migrate.js',
    
    // Storage WAL crash recovery (prd-storage.md)
    wal: 'wal.js',
    
    // Storage mirror replication (prd-storage.md)
    mirror: 'mirror.js',
    
    // Remote storage connectors — S3/R2/MinIO/B2 (prd-storage.md)
    s3: 's3.js',
    
    // Agent spawning
    spawn: 'agent-spawner.js',
    
    // Audit & Metrics
    audit: 'audit.js',
    clean: 'clean.js',
    
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
    
    // Additional utilities
    teams: 'teams.js',
    governance: 'governance.js',
    
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
    // NOTE: api.js is intentionally NOT routed here. `api` stays with the
    // all-mode inline handler below (startFull mode 'api') — a later
    // `api: 'api.js'` key in this object literal used to shadow it silently
    // (duplicate-key footgun). bin/api.js remains reachable for utilities
    // (status/routes/call/docs) via its documented direct invocation.
    agents: 'agents.js',
    error: 'error.js',
    escrow: 'escrow.js',
    nature: 'nature.js',
    agora: 'agora.js',
    genesis: 'genesis.js',
    mesh: 'mesh-status.js',
    notices: 'notices.js',
    universe: 'universe.js',
    scenario: 'scenario.js',   // (Wave U3) governance scenario playbook (prd-universe.md)
    export: 'export.js',       // (Wave U5) provenance/compliance bundle (prd-universe.md)

    // Advertised in help but previously unrouted (pass 16 gap sweep).
    // All 16 have real bin/*.js CLIs; help promised them, the map didn't.
    trust: 'trust.js',
    market: 'market.js',
    secret: 'secret.js',
    transform: 'transform.js',
    context: 'context.js',
    backup: 'backup.js',
    memory: 'memory.js',
    registry: 'registry.js',
    webhooks: 'webhooks.js',
    // Singular alias — help/banner advertised `vant webhook` for months but
    // no route existed (bare command hit unknown-command). webhooks.js shows
    // usage on a bare/unknown subcommand, so the alias is safe.
    webhook: 'webhooks.js',
    zen: 'zen.js',
    consciousness: 'consciousness.js',
    recursion: 'recursion.js',
    forum: 'forum.js',
    trace: 'trace.js',
    // vant qc: the first-user battery (issue #181 Part B)
    qc: 'qc.js',
    // vant init: the First Five Minutes wizard (issue #182)
    init: 'init.js',
    // vant tempo: the time-dilation keeper door (issue #197)
    tempo: 'tempo.js',
    // vant leisure: the want-list keeper door (issue #196)
    leisure: 'leisure.js',
    // vant guest: per-identity multi-guest auth door (H1 of #185)
    guest: 'guest.js',

    // Bin CLIs that existed but were never routed (pass 18 bin sweep)
    org: 'org.js',
    snapshot: 'snapshot.js',
    'brain-registry': 'brain-registry.js',
    'brain-unlock': 'brain-unlock.js',
    'node-registry': 'node-registry.js',
    'islands-boot': 'islands-boot.js',
    'docs-build': 'docs-build.js',
    'build-test': 'build-test.js',
    'format-test': 'format-test.js',
    'test-all': 'test-all.js',

    // Git-branch utility (repo-code branches; distinct from `vant branch`,
    // which manages the BRAIN's git-backed branching). Was unroutable for
    // months because `branch` shadows it in this table.
    'git-branch': 'branch.js'

    // Unrouted on purpose:
    //   mcp.js        — standalone server entry (npm bin "mcp"); `vant mcp`
    //                   is the inline all-mode handler.
    //   cli-standard.js — doc-only template for new CLIs, not a command.
};

const args = process.argv.slice(2);
// (pass 92) -h/--help (or bare invocation) routes to the help command
// instead of 'Unknown command' + exit 1 — every other vant CLI treats
// -h as first-class, the dispatcher was the odd one out.
let cmd = (!args[0] || args[0] === '-h' || args[0] === '--help') ? 'help' : args[0];
// (live-walk fix) An UNKNOWN verb longer than 20 chars used to crash with
// an uncaught `VantError: cmd too long: max 20` — the length rail is for
// ROUTED nouns, never an excuse to die unhandled. Route the refusal
// honestly instead: same shape as the dispatcher's unknown-command block
// (echo + edit-distance suggestions + help pointer), exit 1.
if (cmd) {
    try {
        vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});
    } catch (e) {
        console.error('Unknown command:', cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd);
        const candidates = Object.keys(COMMANDS)
            .filter(k => k !== cmd)
            .map(k => ({ k, d: _editDistance(cmd, k) }))
            .filter(x => x.d <= Math.max(2, Math.floor(cmd.length / 3)))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3);
        if (candidates.length) {
            console.error('Did you mean: ' + candidates.map(x => x.k).join(', ') + '?');
        }
        console.error('Run `vant help` to see all commands.');
        process.exit(1);
    }
}

// Handle: vant help <cmd>
if (cmd === 'help' && args[1]) {
    // Validate command name to prevent injection
    const helpCmd = args[1].replace(/[^a-zA-Z0-9_-]/g, '');
    // (pass 20) Path must be __dirname-anchored: a cwd-relative 'bin/help.js'
    // broke `vant help <cmd>` from any directory other than the install root
    // (MODULE_NOT_FOUND). And without the return below, the parent fell
    // through to its own banner + process.exit(0), racing/losing the child's
    // specific help output.
    const child = spawn('node', [path.join(BIN_DIR, 'help.js'), helpCmd], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code || 0));
    return;
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
            
            const memory = require('../lib/memory');
            
            if (cmd === 'learn') {
                const options = ttl ? { ttl } : {};
                const result = await vant.withSecurity(
                    () => memory.learn(key, content || '', options),
                    { type: 'write', key, args: { key, content: content || '' } }
                );
                console.log(`✅ Learned: ${key}`, result.ttl ? `(TTL: ${result.ttl}ms)` : '');
            } else {
                // remember
                if (content) {
                    // Store
                    const options = ttl ? { ttl } : {};
                    const result = await vant.withSecurity(
                        () => memory.state(key, content, options),
                        { type: 'write', key, args: { key, content } }
                    );
                    console.log(`✅ Remembered: ${key}`, result.ttl ? `(TTL: ${result.ttl}ms)` : '');
                } else {
                    // Recall
                    const result = await vant.withSecurity(
                        () => memory.recall(key),
                        { type: 'read', key, args: { key } }
                    );
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


// Handle address/locate commands
if (cmd === 'address' || cmd === 'locate') {
    const vant = require('../lib/vant');
    
    let data = args.slice(1).join(' ');
    
    if (!data) {
        console.error(`Usage: vant ${cmd} <data|barcode>`);
        console.error(`Example: vant address '{"note": "test"}'`);
        console.error(`       vant locate 1-12345-67890-5`);
        process.exit(1);
    }
    
    (async () => {
        try {
            await vant.init({ debug: false });
            const memory = require('../lib/memory');
            
            if (cmd === 'address') {
                let parsed;
                try { parsed = JSON.parse(data); } catch(e) { parsed = data; }
                const barcode = await memory.address(parsed);
                console.log(`✅ Addressed: ${barcode}`);
            } else {
                const result = await memory.locate(data);
                console.log(result || '(not found)');
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
  vant clean     Unified cleanup (logs, tmp, cache, prune)
  vant branch    Branch management
  vant repos     External repo management
  vant teams     Organization/Team management
  vant governance Governance decisions

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

Memory (Unified API - sandbox + RLS secured):
  vant learn <key> <content> [--ttl ms]  Store document (markdown)
  vant remember <key> [content] [--ttl ms]  Store/recall state
  vant address <data> [--ttl ms]          Store at NSC9 geometric address
  vant locate <barcode>                  Retrieve from NSC9 address
  vant memory <cmd>                       Full memory CLI (state|learn|query|...)

Development:
  vant test         Run smoke tests
  vant test core    Run core test suite
  vant test full    Run all tests (~1,800 declared cases across 200+ /test suites)
  vant test-all     17-check self-test (health/search/islands/lib exports)
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
  vant migrate    Brain layout versioning (--status | --dry-run | apply)
  vant wal        Storage crash-recovery journal (--status | --drill | --reset <basePath>)
  vant s3         Remote storage connectors — S3/R2/MinIO/B2 (--status | --test | --ls | --push | --pull)
  vant mirror     Storage replication (--status | --verify <path> | --resync)

State:
  vant watch      Poll GitHub for changes
  vant summary    Session stats

Integrations:
  vant mcp        MCP server for AI tools
  vant node       Persistent node
  vant webhooks   Webhook management (list/add/remove/test)
  vant server     HTTP/HTTPS server with security chain

Utilities:
  vant spawn      Spawn/manage agents (agent-spawner)
  vant canvas     Visualization tools
  vant compress   Compression tools
  vant compute   Multi-language runner
  vant embed     Embedding/vector ops
  vant format    Format detection
  vant metrics   Metrics dashboard
  vant rls       Row-level security
  vant system    System diagnostics
  vant universe  Genesis snapshots + manifests (Waves U1–U3)
  vant scenario  Governance scenario playbook (Wave U3)
  vant export    Provenance/compliance bundle (Wave U5)
  vant bot       Bot utilities

System Utilities:
  vant auth       Authentication
  vant citations  Citation management
  vant consensus  Consensus mechanisms
  vant framework  Framework utilities
  vant habitat    Workspace/RLS management (lib/habitat.js)
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
  vant docs       Docs management
  vant islands-boot Island initialization
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
  vant geometry          NSC9 quasicrystal storage (barcode addressing)

NSC9 Geometric:
  vant geometry store <key> <val>   Store in quasicrystal
  vant geometry retrieve <key>       Retrieve from quasicrystal
  vant geometry address <data>      Store at random barcode
  vant geometry locate <barcode>    Retrieve by barcode

Auth:
  MCP requires API key if VANT_MCP_REQUIRE_KEY=true.
  Set: vant config set mcp.requireKey true
  Key:  vant config set mcp.apiKey "your-secret-key"
  Or:   export VANT_MCP_API_KEY=your-secret-key
  Env:  export VANT_MCP_REQUIRE_KEY=true
  Use:  Header X-API-Key: <key> or Authorization: Bearer <key>
  REST: server auth is optional by default — set VANT_SERVER_AUTH_REQUIRED=1
        + VANT_API_KEY to require it (see: vant server --help)

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

Headless (the serving pod):
  vant headless [--port <n>] [--api-port <n>] [--bind <addr>]
    Boots the combined pod: the MCP door IS the headless API (Rook's prime
    directive, #185/#187); the REST listener drops to health-only. The node
    registers for discovery; the ONE auth posture prints; a pairing code
    is handed out for a dashboard session. Programmatic door:
    await require('../lib/vant').startHeadless();
  Ports follow VANT_MCP_PORT / VANT_SERVER_PORT; bind follows VANT_SERVER_BIND.
  Per-identity multi-guest auth (H1) is LIVE: 'vant guest issue|list|revoke'
  + the door gate (docs/security/multi-guest-auth.md).

  (vant notify / vant linear were removed: no backing CLI exists.
  Notifications and Linear live on the islands/lib API, not the shell.)

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

Security posture (EW8, #190):
  Network doors authenticate differently — check the door you expose:
    server   mcp.requireKey true + mcp.apiKey set; server additionally honors
             --auth / VANT_SERVER_AUTH_REQUIRED for VANT_API_KEY.
    mcp      same keys as server (mcp.requireKey / mcp.apiKey); set them
             BEFORE exposing the MCP port beyond loopback.
    stdout   Loopback-bound plaintext by design; TLS + auth required before
             any non-loopback bind (--insecure is the explicit escape).
`);
    process.exit(0);
}

// Levenshtein distance for the unknown-command suggestion (small n, plain DP
// is fine; no dep needed).
function _editDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return dp[m][n];
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
    } else if (cmd === 'mcp' || cmd === 'api' || cmd === 'all' || cmd === 'headless') {
        // (pass 20) `vant api <subcmd>` = the utility CLI (bin/api.js:
        // status/routes/call/docs); bare `vant api` = all-mode API-server
        // mode. Previously the utility CLI was unreachable — the inline
        // handler swallowed its subcommands too.
        if (cmd === 'api' && args[1]) {
            const sub = args[1].replace(/[^a-zA-Z0-9_-]/g, '');
            const child = spawn('node', [path.join(BIN_DIR, 'api.js'), sub, ...args.slice(2)], { stdio: 'inherit' });
            child.on('exit', (code) => process.exit(code || 0));
            return;
        }
        // (pass 128) `vant mcp --stdio` and `vant mcp --help` previously fell
        // through to the inline all-mode handler, which ignored the flag and
        // started the HTTP server. bin/mcp.js owns those paths (stdio mode,
        // -h/--help, -p/--port) — delegate to it instead.
        if (cmd === 'mcp' && args.length > 1) {
            const mcpChild = spawn('node', [path.join(BIN_DIR, 'mcp.js'), ...args.slice(1)], { stdio: 'inherit' });
            mcpChild.on('exit', (code) => process.exit(code || 0));
            return;
        }
        // All-mode handler
        const mode = cmd;
        const vant = require('../lib/vant');
        // (EW2, #190) THIS is the long-lived in-process door (startFull keeps
        // the event loop alive in THIS process). The crash leash registers
        // HERE — before the servers boot — so a stray uncaught rejection
        // releases brain-lock leases and Ctrl-C/SIGTERM exits gracefully
        // instead of dying handler-less.
        let _leashing = false;
        function _leashExit(code, reason) {
            if (_leashing) return;   // double-exit guard: first verdict wins
            _leashing = true;
            try {
                console.error('[leash] ' + reason);
                try {
                    require('../lib/brain-lock').forceReleaseBrainLock({ reason: 'leash' });
                } catch (e) { /* lock layer unavailable — still exit */ }
            } finally {
                process.exit(code);
            }
        }
        process.on('uncaughtException', (e) => _leashExit(1, 'uncaught exception: ' + (e && e.stack || e)));
        process.on('unhandledRejection', (e) => _leashExit(1, 'unhandled rejection: ' + (e && (e.stack || e.message) || e)));
        for (const SIG of ['SIGTERM', 'SIGINT']) {
            process.on(SIG, () => _leashExit(0, SIG + ' — releasing leases and exiting'));
        }
        // (#187) `vant all` = the legacy name for the combined server; the
        // audit retired the trifecta framing. Keep it working (honest
        // pointer; no removal), but the front door is `vant headless`.
        if (cmd === 'all') {
            console.log('Note: `vant all` is the legacy name. Prefer `vant headless` - the serving pod\n  with the MCP door as THE API (REST drops to health-only), node registration,\n  and a pairing code. (Issue #187 retire list.)\n');
        }
        // (#187, H6) `vant headless` = the pod's front door: MCP door as THE
        // API, REST health-only, node registration, pairing code, ONE honest
        // auth posture. Runs STARTUP ONLY here - the long-lived pod keeps
        // the event loop alive through the same leash below.
        if (cmd === 'headless') {
            if (args[1] === '-h' || args[1] === '--help') {
                console.log(`\nHeadless serving pod (issue #187): the pod, not "REST without MCP".\n\n  vant headless [--port <mcp>] [--api-port <rest>] [--bind <addr>]\n\nBoots the combined pod:\n\n  - the MCP door IS the headless API (the same 300+ tools any client gets -\n    no privileged dashboard surface exists)\n  - the REST listener drops to health-only (/tools and /brain retired)\n  - the node registers for discovery\n  - the ONE auth posture prints, and a pairing code is handed out\n\nPer-identity multi-guest auth (H1) is LIVE: guest tokens gate the door by\nrole (observer/human/agent), revoke is denylist-backed, and the pairing\ncode redeems single-use via 'vant guest pair --code ...'.\n\nPorts: VANT_MCP_PORT (default 3457), VANT_SERVER_PORT (default 3456),\nbind: VANT_SERVER_BIND (default 127.0.0.1).\n`);
                process.exit(0);
            }
            const opts = { debug: true };
            for (let i = 1; i < args.length; i++) {
                const a = args[i];
                if (a === '--port') opts.mcpPort = parseInt(args[++i], 10);
                else if (a === '--api-port') opts.apiPort = parseInt(args[++i], 10);
                else if (a === '--bind') opts.bind = args[++i];
            }
            vant.startHeadless(opts).then(r => {
                console.log('✓ Headless pod up (mode: headless)');
                console.log('  Ports:', r.ports);
                console.log('  API:', r.endpoints && r.endpoints.mcp);
                console.log('  Health:', r.endpoints && r.endpoints.health);
                console.log('  Node registry:', r.registered ? 'registered (' + (r.registered.id || r.registered.name || 'ok') + ')' : 'skipped');
                console.log('\n🛑 Press Ctrl+C to stop\n');
            }).catch(e => {
                console.error('Failed to start headless pod:', e.message);
                process.exit(1);
            });
            return;
        }
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
        // Suggest the closest real command (edit distance over routed names
        // + built-ins). Catches typos like `vant helth` → health.
        const candidates = Object.keys(COMMANDS)
            .filter(k => k !== cmd)
            .map(k => ({ k, d: _editDistance(cmd, k) }))
            .filter(x => x.d <= Math.max(2, Math.floor(cmd.length / 3)))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3);
        if (candidates.length) {
            console.error('Did you mean: ' + candidates.map(x => x.k).join(', ') + '?');
        }
        console.error('Run `vant help` to see all commands.');
        process.exit(1);
    }
    return;
}

const scriptPath = path.join(BIN_DIR, script);
const child = spawn('node', [scriptPath, ...process.argv.slice(3)], {
    stdio: 'inherit',
    env: {
        ...process.env,
        // (issue #230) children inherit the invocation's ONE advisory —
        // see lib/gate.js _warn: the per-process latch alone printed it
        // twice per invocation (parent dispatch read + child route read).
        VANT_GATE_QUIET: '1',
        // Spawned subcommand (start/health/sync/migrate...) read and wrote the
        // cwd stays the user's project (see below); libs that need the
        // install tree (horcrux targets, templates, boot dirs) resolve it
        // via lib/anchor.js getRepoRoot() instead of guessing from cwd or
        // __dirname. Brain CONTENT paths stay cwd-anchored BY DESIGN.
        VANT_REPO_ROOT: path.resolve(__dirname, '..')
    }
    // cwd: intentionally NOT overridden. Subcommands must run in the user's
    // working directory - the brain runtime resolves models/ relative to cwd
    // (lib/brain.js getBrainPath). The previous cwd=package-root meant every
    // spawned subcommand (start/health/sync/migrate...) read and wrote the
    // install directory instead of the user's project.
});

child.on('exit', (code) => process.exit(code || 0));