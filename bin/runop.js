#!/usr/bin/env node
/**
 * Vant Runop CLI
 * Run operations
 * 
 * Usage:
 *   vant runop list                 # List operations
 *   vant runop run <op>            # Run operation
 *   vant runop status <id>         # Check status
 *   vant runop cancel <id>         # Cancel operation
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Runop CLI - Run operations

Usage:
  vant runop list                   List operations
  vant runop run <op>              Run operation
  vant runop status <id>           Check operation status
  vant runop cancel <id>           Cancel operation
  vant runop history               Show operation history
`);
    process.exit(0);
}

function run() {
    const runop = require('../lib/runop');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Operations: (use runop.list() for actual list)');
    } else if (subcmd === 'run' || subcmd === 'execute' || subcmd === 'start') {
        const op = args[1];
        if (!op) {
            console.error('Usage: vant runop run <operation>');
            process.exit(1);
        }
        console.log('Running operation:', op);
    } else if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'check') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant runop status <id>');
            process.exit(1);
        }
        console.log('Checking status:', id);
    } else if (subcmd === 'cancel' || subcmd === 'kill' || subcmd === 'stop') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant runop cancel <id>');
            process.exit(1);
        }
        console.log('Cancelling operation:', id);
    } else if (subcmd === 'history' || subcmd === 'log') {
        console.log('Operation history: (use runop.history() for list)');
    } else {
        console.log('Usage: vant runop <command>');
        process.exit(1);
    }
}

run();
