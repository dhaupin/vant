#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - fixed config only

/**
 * Vant Run
 * CLI-based runtime entry point
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage: vant run [-h|--help] [-p|--prompt <task>] [-m|--mcp]
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant run [-h|--help] [-p|--prompt <task>] [-m|--mcp]');
    console.log('');
    console.log('  -h, --help    Show this help');
    console.log('  -p, --prompt  Run single task and exit');
    console.log('  -m, --mcp    Start MCP server');
    process.exit(0);
}

console.log(`
╔═══════════════════════════════════════╗
║       Vant Runtime                     ║
╚═══════════════════════════════════════╝

Run with: node bin/vant.js start

Or use these commands:
1. vant health    - Check system health
2. vant load      - Load brain files
3. vant test     - Run tests
4. vant sync     - Sync with GitHub
`);

process.exit(0);
