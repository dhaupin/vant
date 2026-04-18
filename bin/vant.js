#!/usr/bin/env node
/**
 * vant CLI - Command aliases
 *
 * Usage: vant <command> [args]
 *
 * Commands:
 *   vant start      - Full startup
 *   vant sync       - GitHub sync
 *   vant health     - Diagnostics
 *   vant load       - Load brain
 *   vant run        - Runtime
 *   vant test       - Build tests
 *   vant changelog  - View changes
 *   vant summary    - Session summary
 *   vant watch      - Monitor GitHub
 *   vant setup      - Interactive setup
 *   vant help       - Show help
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
    changelog: 'changelog.js',
    summary: 'summary.js',
    update: 'update.js',
    watch: 'watch.js',
    bump: 'bump.js',
    setup: 'setup.js',
    rate: 'rate.js'
};

const cmd = process.argv[2];

if (!cmd || cmd === 'help') {
    console.log(`
╔═══════════════════════════════════════╗
║         vant CLI v0.8.2              ║
╚═══════════════════════════════════════╝

Usage: vant <command> [options]

Commands:
  vant start        Full startup
  vant sync        Pull from GitHub
  vant health      System diagnostics
  vant load        Load brain
  vant run         Start runtime
  vant test        Run build tests
  vant changelog   View changes
  vant summary     Session summary
  vant watch       Monitor GitHub
  vant setup       Interactive setup
  vant help        Show help
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