/**
 * Vant Help Command
 * Shows all available commands with descriptions
 */

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
        desc: 'Acquire/release brain lock',
        usage: 'vant lock [acquire|release]'
    },
    branch: {
        desc: 'List/switch brain branches',
        usage: 'vant branch [list|switch|create] [name]'
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

showHelp(target === 'help' && args[1] ? args[1] : null);