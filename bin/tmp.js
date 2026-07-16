#!/usr/bin/env node
/**
 * Vant Tmp CLI
 * Temp file management
 * 
 * Usage:
 *   vant tmp list                  # List temp files
 *   vant tmp clean                 # Clean temp files
 *   vant tmp create <content>      # Create temp file
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Tmp CLI - Temp file management

Usage:
  vant tmp list                     List temp files
  vant tmp clean                    Clean temp files
  vant tmp create <content>         Create temp file
  vant tmp stats                    Show temp stats
`);
    process.exit(0);
}

function run() {
    const tmp = require('../lib/tmp');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Temp files: (use tmp.list() for actual list)');
    } else if (subcmd === 'clean' || subcmd === 'clear' || subcmd === 'wipe') {
        console.log('Cleaning temp files...');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        const content = args.slice(1).join(' ') || 'temp';
        console.log('Creating temp file with:', content);
    } else if (subcmd === 'stats' || subcmd === 'info' || subcmd === 'status') {
        console.log('Temp stats: (use tmp.stats() to get)');
    } else {
        console.log('Usage: vant tmp <command>');
        process.exit(1);
    }
}

run();
