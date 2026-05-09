/**
 * Vant Help Command
 * Shows all available commands with descriptions
 */

const vaf = require("../lib/vaf");
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
        desc: 'Load brain from models/public or custom path',
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
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                        VANT CLI HELP                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Usage: vant <command> [options]');
    console.log('');
    
    // Core commands
    console.log('  CORE:');
    for (const [name, info] of Object.entries(COMMANDS)) {
        const pad = name.padEnd(12);
        console.log(`    ${pad} ${info.desc}`);
    }
    
    console.log('');
    console.log('  Examples:');
    console.log('    vant setup              # Interactive setup');
    console.log('    vant start              # Full startup');
    console.log('    vant health             # Check system');
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
const cmd = args[0] || 'help';
const target = ALIASES[cmd] || cmd;

// Show specific help if command is provided, otherwise show all
showHelp(args[1] || (COMMANDS[target] ? target : null));
    if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});
