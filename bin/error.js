#!/usr/bin/env node
/**
 * Vant Error CLI
 * Error handling utilities
 * 
 * Usage:
 *   vant error list                 # List error types
 *   vant error code <code>         # Get error info
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Error CLI - Error handling

Usage:
  vant error list                   List error types
  vant error code <code>           Get error info
  vant error explain <code>        Explain error
`);
    process.exit(0);
}

function run() {
    const error = require('../lib/error');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Error types: (use error.list() to list)');
    } else if (subcmd === 'code' || subcmd === 'info') {
        const code = args[1];
        if (!code) {
            console.error('Usage: vant error code <code>');
            process.exit(1);
        }
        console.log('Error info for:', code);
    } else if (subcmd === 'explain' || subcmd === 'describe') {
        const code = args[1];
        if (!code) {
            console.error('Usage: vant error explain <code>');
            process.exit(1);
        }
        console.log('Explaining error:', code);
    } else {
        console.log('Usage: vant error <command>');
        process.exit(1);
    }
}

run();
