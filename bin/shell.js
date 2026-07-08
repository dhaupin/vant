#!/usr/bin/env node
/**
 * Vant Shell CLI
 * Shell operations
 * 
 * Usage:
 *   vant shell exec <cmd>           # Execute command
 *   vant shell script <file>        # Run script
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Shell CLI - Shell operations

Usage:
  vant shell exec <cmd>             Execute command
  vant shell script <file>         Run script file
  vant shell interactive           Start interactive shell
`);
    process.exit(0);
}

function run() {
    const shell = require('../lib/shell');
    
    if (subcmd === 'exec' || subcmd === 'run' || subcmd === 'execute') {
        const cmd = args.slice(1).join(' ');
        if (!cmd) {
            console.error('Usage: vant shell exec <command>');
            process.exit(1);
        }
        console.log('Executing:', cmd);
    } else if (subcmd === 'script' || subcmd === 'file') {
        const file = args[1];
        if (!file) {
            console.error('Usage: vant shell script <file>');
            process.exit(1);
        }
        console.log('Running script:', file);
    } else if (subcmd === 'interactive' || subcmd === 'interactive' || subcmd === 'i') {
        console.log('Starting interactive shell...');
    } else {
        console.log('Usage: vant shell <command>');
        process.exit(1);
    }
}

run();
