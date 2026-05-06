#!/usr/bin/env node
const vaf = require("../lib/vaf");
const version = require('../lib/version');
/**
 * vant CLI - Command aliases
 *
 * Usage: vant <command> [args]
 *
 * Commands:
 *   vant start      - Full startup (health → sync → load → run)
 *   vant sync       - Pull/push brain from/to GitHub
 *   vant health     - System diagnostics and model check
 *   vant load       - Load brain from models/public
 *   vant run        - Start runtime (long-running agent loop)
 *   vant test       - Run build tests
 *   vant changelog  - View recent changes
 *   vant summary    - Session summary - memory, state, stats
 *   vant watch      - Monitor GitHub for changes (poll)
 *  vant help        - Show help (this command)
 *   vant setup      - Interactive setup wizard
 *   vant update     - Check for new Vant releases
 *   vant rate       - Show GitHub API rate limit
 *   vant bump      - Bump version and tag release
 *   vant docs      - Build docs for release
 *   vant node      - Run as persistent node
 *   vant mcp       - Run MCP server for AI tools
 */

const { spawn } = require('child_process');
const path = require('path');

const BIN_DIR = __dirname;

const COMMANDS = {
    start: 'start.js',
    sync: 'sync.js',
    health: 'health.js',
    load: 'load.js',
    run: 'run.js',
    test: 'build-test.js',
    'test v086': 'test-v086.js',
    vibe: 'vibe.js',
    repos: 'repos.js',
    hybrid: 'hybrid.js',
    search: 'search.js',
    validate: 'validate.js',
    changelog: 'changelog.js',
    summary: 'summary.js',
    update: 'update.js',
    watch: 'watch.js',
    bump: 'bump.js',
    docs: 'docs.js',
    setup: 'setup.js',
    rate: 'rate.js',
    help: 'help.js',
    node: 'node.js',
    mcp: 'mcp.js',
    onboard: 'onboard.js',
    resolution: 'resolution.js',
    succession: 'succession.js',
    bot: 'bot.js',
    compress: 'compress.js',
    // Stego brain recovery
    stego: 'stego.js',
    // Automated pruning
    prune: 'prune.js',
    // Ghost in the Machine
    boot: 'boot.js',
    // NEW: Islands (componentized brain)
    islands: 'islands-boot.js'
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

Development:
  vant test         Run build tests
  vant test v086    Run v0.8.6 test suite
  vant validate    Schema + audit + circuits
  vant changelog   View changes

Sync:
  vant repos       Mount external repos
  vant hybrid     Public/Private split sync
  vant search    RAG + hybrid search

Brain:
  vant onboard     Browse brain files
  vant islands    Componentized brain boot
  vant prune      Prune brain (LTC generation)
  vant succession Trust levels
  vant resolution Thought resolution

State:
  vant vibe        Show/set vibe
  vant watch      Poll GitHub for changes
  vant summary    Session stats

Integrations:
  vant mcp        MCP server for AI tools
  vant node       Persistent node
  vant webhook   Webhook server + send
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
    console.error('Unknown command:', cmd);
    process.exit(1);
}

const scriptPath = path.join(BIN_DIR, script);
const child = spawn('node', [scriptPath, ...process.argv.slice(3)], {
    stdio: 'inherit',
    cwd: path.dirname(__dirname)
});

child.on('exit', (code) => process.exit(code || 0));