/**
 * Vant Help Command
 * Shows all available commands with descriptions
 */

const vaf = require("../lib/vaf");
const theme = require("../lib/theme");
const path = require('path');
const fs = require('fs');

const COMMANDS = {
    // Core
    start: {
        desc: 'Full startup - health → sync → load → run',
        usage: 'vant start'
    },
    sync: {
        desc: 'Pull/push brain from/to GitHub',
        usage: 'vant sync [push|pull]'
    },
    health: {
        desc: 'System diagnostics and model check',
        usage: 'vant health'
    },
    load: {
        desc: 'Load brain from models/private or custom path',
        usage: 'vant load [version]'
    },
    run: {
        desc: 'Start runtime (long-running agent loop)',
        usage: 'vant run'
    },
    
    // Info
    test: {
        desc: 'Run build tests',
        usage: 'vant test'
    },
    changelog: {
        desc: 'View recent changes',
        usage: 'vant changelog'
    },
    summary: {
        desc: 'Session summary - memory, state, stats',
        usage: 'vant summary'
    },
    watch: {
        desc: 'Monitor GitHub for changes (poll)',
        usage: 'vant watch [interval]'
    },
    help: {
        desc: 'Show this help message',
        usage: 'vant help [command]'
    },
    
    // Maintenance
    setup: {
        desc: 'Interactive setup wizard',
        usage: 'vant setup'
    },
    update: {
        desc: 'Check for new Vant releases',
        usage: 'vant update'
    },
    rate: {
        desc: 'Show GitHub API rate limit status',
        usage: 'vant rate'
    },
    bump: {
        desc: 'Bump version and tag release',
        usage: 'vant bump [major|minor|patch]'
    },
    
    // Advanced
    lock: {
        desc: 'Brain write lock (multi-agent safety)',
        usage: 'vant lock [acquire|release|status|force]',
        detail: `Brain lock for multi-agent writes.
  acquire - Acquire lock (returns token)
  release - Release lock (using token)
  status   - Show lock status
  force    - Force release (admin)
See: vant lock --help`
    },
    branch: {
        desc: 'List/switch brain branches',
        usage: 'vant branch [list|switch|create] [name]'
    },
    
    // Integrations
    server: {
        desc: 'HTTP/HTTPS server with security chain',
        usage: 'vant server [--port <port>] [--host <host>] [--cert <path>] [--key <path>]',
        detail: `Run Vant HTTP/HTTPS server.

Options:
  -p, --port <port>    Server port (default: 3456)
  -h, --host <host>    Bind address (default: 127.0.0.1)
  -c, --cert <path>    TLS certificate path
  -k, --key <path>    TLS key path
  -i, --insecure      Allow HTTP (dev only)
  -a, --auth          Require API key

Set VANT_API_KEY to require authentication.
See: vant server --help`,
    },
    mcp: {
        desc: 'Run MCP server for AI tools (use --help for auth)',
        usage: 'vant mcp [--server|--stdio]',
        detail: `Run MCP server for AI tool access.
Set VANT_MCP_API_KEY to enable auth.
See: vant mcp --help`
    },
    node: {
        desc: 'Run as persistent node (polls GitHub)',
        usage: 'vant node [--mcp] [--poll-interval=60]',
        detail: `Run Vant as persistent node.
Set VANT_GITHUB_REPO and VANT_GITHUB_TOKEN.
See: vant node --help`
    },
    bot: {
        desc: 'Run Telegram bot',
        usage: 'vant bot'
    },
    
    // Info
    onboard: {
        desc: 'Show onboarding summary',
        usage: 'vant onboard [files|read|search]',
        detail: 'View brain files.\nSee: vant onboard help'
    },
    resolution: {
        desc: 'Thought resolution system',
        usage: 'vant resolution [status|list|resolve|deprecate|reject]',
        detail: 'Mark thoughts resolved.\nSee: vant resolution help'
    },
    succession: {
        desc: 'Brain succession status',
        usage: 'vant succession [status|trust|log]',
        detail: 'Manage brain trust levels.\nSee: vant succession help'
    },

    // New / Additional
    trust: {
        desc: 'Trust & reputation system',
        usage: 'vant trust score|record|leaderboard|can|required',
        detail: 'Manage trust scores and permissions.\nSee: vant trust --help'
    },
    market: {
        desc: 'Knowledge trading market',
        usage: 'vant market list|bid|search|trade|stats',
        detail: 'Trade knowledge with escrow.\nSee: vant market --help'
    },
    config: {
        desc: 'Get/set configuration',
        usage: 'vant config get|set|list <key> [value]',
        detail: 'Manage vant configuration.'
    },
    teams: {
        desc: 'Team permissions & roles',
        usage: 'vant teams list|add|remove|perm',
        detail: 'Manage team permissions.\nSee: vant teams --help'
    },
    consensus: {
        desc: 'Voting & decision system',
        usage: 'vant consensus vote|propose|results',
        detail: 'Distributed decision making.\nSee: vant consensus --help'
    },
    escrow: {
        desc: 'Escrow quota management',
        usage: 'vant escrow status|hold|release',
        detail: 'Manage operation quotas.\nSee: vant escrow --help'
    },
    governance: {
        desc: 'System governance rules',
        usage: 'vant governance check|set',
        detail: 'Governance & consent.\nSee: vant governance --help'
    },
    repos: {
        desc: 'Mount external repositories',
        usage: 'vant repos --list|--mount|--pull',
        detail: 'Register and mount external repos.\nSee: vant repos --help'
    },
    hybrid: {
        desc: 'Hybrid sync (public/private split)',
        usage: 'vant hybrid --public|--private',
        detail: 'Push public or private only.\nSee: vant hybrid --help'
    },
    search: {
        desc: 'Search brain with RAG',
        usage: 'vant search [query]|--hybrid|--hyde',
        detail: 'Search with RAG + HyDE.\nSee: vant search --help'
    },
    stego: {
        desc: 'Encode/decode brain in images',
        usage: 'vant stego encode|decode|snapshot|capacity',
        detail: 'LSB steganography for brain transfer.\nSee: vant stego --help'
    },
    boot: {
        desc: 'Ghost boot from stego image',
        usage: 'vant boot --image <url>',
        detail: 'Zero-config boot from image URL.\nSee: vant boot --help'
    },
    prune: {
        desc: 'Prune brain to LTC',
        usage: 'vant prune [--dry-run|--force]',
        detail: 'Generate LTC (Less Than Context).\nSee: vant prune --help'
    },
    islands: {
        desc: 'Componentized brain boot',
        usage: 'vant islands --list|--island|--prompt',
        detail: 'Boot brain components on trigger.\nSee: vant islands --help'
    },
    validate: {
        desc: 'Validate schema + audit + circuits',
        usage: 'vant validate --check',
        detail: 'Full validation suite.\nSee: vant validate --help'
    },
    vibe: {
        desc: 'Show/set current vibe',
        usage: 'vant vibe [experimental|safety_first]',
        detail: 'Track agent mood for context.\nSee: vant vibe --help'
    },
    compress: {
        desc: 'Compress brain for transfer',
        usage: 'vant compress',
        detail: 'Compress brain to minimal form.'
    },
    docs: {
        desc: 'Build docs for release',
        usage: 'vant docs',
        detail: 'Generate documentation.'
    },
    
    // Dev / Build
    audit: {
        desc: 'Generate AUDIT.md report',
        usage: 'vant audit [--out FILE]',
        detail: 'Codebase analysis report.\nSee: vant audit --help'
    },
    format: {
        desc: 'Format code with prettier',
        usage: 'vant format [--check]',
        detail: 'Format all JS files.\nSee: vant format --help'
    },
    schema: {
        desc: 'Validate JSON schemas',
        usage: 'vant schema validate',
        detail: 'Validate schema files.\nSee: vant schema --help'
    },
    
    // Storage / Data
    cache: {
        desc: 'Cache operations',
        usage: 'vant cache get|set|clear',
        detail: 'In-memory cache.\nSee: vant cache --help'
    },
    storage: {
        desc: 'Persistent storage',
        usage: 'vant storage get|set|list',
        detail: 'File-based storage.\nSee: vant storage --help'
    },
    sandbox: {
        desc: 'Sandbox permissions',
        usage: 'vant sandbox allow|deny|status',
        detail: 'Manage sandbox capabilities.\nSee: vant sandbox --help'
    },
    
    // Security
    security: {
        desc: 'Security utilities',
        usage: 'vant security scan|check',
        detail: 'Security scanning.\nSee: vant security --help'
    },
    encrypt: {
        desc: 'Encrypt/decrypt files',
        usage: 'vant encrypt <file>',
        detail: 'AES-256 encryption.\nSee: vant encrypt --help'
    },
    
    // System
    system: {
        desc: 'System info and utils',
        usage: 'vant system info',
        detail: 'System diagnostics.\nSee: vant system --help'
    },
    vaf: {
        desc: 'Validate input (vaf)',
        usage: 'vant vaf check|validate',
        detail: 'Input validation.\nSee: vant vaf --help'
    },
    error: {
        desc: 'Error handling utilities',
        usage: 'vant error handle|parse',
        detail: 'Error utilities.\nSee: vant error --help'
    },
    event: {
        desc: 'Event emitter system',
        usage: 'vant event emit|listen',
        detail: 'Event system.\nSee: vant event --help'
    },
    
    // Network
    network: {
        desc: 'Network utilities',
        usage: 'vant network status',
        detail: 'Network diagnostics.\nSee: vant network --help'
    },
    connector: {
        desc: 'External service connectors',
        usage: 'vant connector list|add',
        detail: 'Connect to services.\nSee: vant connector --help'
    },
    
    // Data / Analytics
    metrics: {
        desc: 'Metrics collection',
        usage: 'vant metrics get|set',
        detail: 'Metrics tracking.\nSee: vant metrics --help'
    },
    qos: {
        desc: 'Quality of service',
        usage: 'vant qos status|limits',
        detail: 'Rate limiting & QoS.\nSee: vant qos --help'
    },
    lineage: {
        desc: 'Data lineage tracking',
        usage: 'vant lineage track',
        detail: 'Track data origins.\nSee: vant lineage --help'
    },
    stream: {
        desc: 'Stream processing',
        usage: 'vant stream process',
        detail: 'Stream utilities.\nSee: vant stream --help'
    },
    
    // External
    telegram: {
        desc: 'Telegram bot',
        usage: 'vant telegram start',
        detail: 'Run Telegram bot.\nSee: vant telegram --help'
    },
    skills: {
        desc: 'Skill management',
        usage: 'vant skills list|add',
        detail: 'Manage skills.\nSee: vant skills --help'
    },
    
    // Integrations
    embed: {
        desc: 'Embed brain in images',
        usage: 'vant embed encode|decode',
        detail: 'Steganography embed.\nSee: vant embed --help'
    },
    rerank: {
        desc: 'Rerank search results',
        usage: 'vant rerank query',
        detail: 'Rerank with models.\nSee: vant rerank --help'
    },
    
    // Brain / Memory
    brain: {
        desc: 'Brain file operations',
        usage: 'vant brain read|write|list',
        detail: 'Direct brain access.\nSee: vant brain --help'
    },
    framework: {
        desc: 'Framework utilities',
        usage: 'vant framework build|serve',
        detail: 'Framework helpers.\nSee: vant framework --help'
    },
    compute: {
        desc: 'Compute engine',
        usage: 'vant compute run',
        detail: 'Run computations.\nSee: vant compute --help'
    },
    canvas: {
        desc: 'Canvas rendering',
        usage: 'vant canvas render',
        detail: 'Canvas operations.\nSee: vant canvas --help'
    },
    
    // Advanced
    geometry: {
        desc: 'Geometry calculations',
        usage: 'vant geometry calc',
        detail: 'Math utilities.\nSee: vant geometry --help'
    },
    nature: {
        desc: 'Nature simulation',
        usage: 'vant nature simulate',
        detail: 'Nature algorithms.\nSee: vant nature --help'
    },
    habitat: {
        desc: 'Habitat simulation',
        usage: 'vant habitat run',
        detail: 'Habitat engine.\nSee: vant habitat --help'
    },
    theme: {
        desc: 'Theme utilities',
        usage: 'vant theme get|set',
        detail: 'Theme management.\nSee: vant theme --help'
    },
    shell: {
        desc: 'Shell commands',
        usage: 'vant shell exec',
        detail: 'Execute shell.\nSee: vant shell --help'
    },
    legal: {
        desc: 'Legal/compliance utils',
        usage: 'vant legal check',
        detail: 'Compliance tools.\nSee: vant legal --help'
    },
    horcrux: {
        desc: 'Split brain into shards',
        usage: 'vant horcrux split|join',
        detail: 'Shard brain.\nSee: vant horcrux --help'
    },
    msg: {
        desc: 'Message handling',
        usage: 'vant msg send|receive',
        detail: 'Messaging system.\nSee: vant msg --help'
    },
    nodes: {
        desc: 'Node management',
        usage: 'vant nodes list|add',
        detail: 'Node operations.\nSee: vant nodes --help'
    },
    remote: {
        desc: 'Remote operations',
        usage: 'vant remote connect',
        detail: 'Remote access.\nSee: vant remote --help'
    },
    rules: {
        desc: 'Rule engine',
        usage: 'vant rules evaluate',
        detail: 'Rule system.\nSee: vant rules --help'
    },
    rls: {
        desc: 'Row-level security',
        usage: 'vant rls check',
        detail: 'RLS utilities.\nSee: vant rls --help'
    },
    tmp: {
        desc: 'Temp file handling',
        usage: 'vant tmp create|cleanup',
        detail: 'Temp files.\nSee: vant tmp --help'
    }
};

const ALIASES = {
    '-h': 'help',
    '--help': 'help',
    '-v': 'version',
    '--version': 'version'
};

function showHelp(command) {
    const cols = process.stdout.columns || 80;
    
    if (command && COMMANDS[command]) {
        // Show specific command help
        const c = COMMANDS[command];
        console.log('\n  Command: vant ' + command);
        console.log('  Usage:  ' + c.usage);
        console.log('  Desc:   ' + c.desc);
        if (c.detail) {
            console.log('');
            console.log(c.detail);
        }
        console.log('');
        return;
    }
    
    // Show all commands
    console.log('\n' + theme.vantHeader + ' CLI Help\n');
    console.log(theme.label('Usage:') + ' vant <command> [options]\n');
    
    // Core commands
    console.log(theme.section('CORE:'));
    for (const [name, info] of Object.entries(COMMANDS)) {
        console.log('  ' + theme.subsection(name) + '  ' + info.desc);
    }
    
    console.log('\n' + theme.section('Examples:'));
    console.log('   vant setup              # Interactive setup');
    console.log('   vant start              # Full startup');
    console.log('   vant health             # Check system');
    console.log('    vant sync push          # Push brain to GitHub');
    console.log('    vant branch create experiment-1  # New brain branch');
    console.log('    vant help sync          # Help for specific command');
    console.log('');
    console.log('  Docs:  https://github.com/dhaupin/vant#readme');
    console.log('  Issues: https://github.com/dhaupin/vant/issues');
    console.log('');
}

// Get command from args
const args = process.argv.slice(2);
const cmd = args[0] || '';
const target = ALIASES[cmd] || cmd;

// Show specific help if command is provided, otherwise show all
// Empty cmd or 'help' shows all commands
showHelp(args[0] && args[0] !== 'help' && COMMANDS[target] ? target : null);
    if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});
