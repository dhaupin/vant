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

async function run() {
    const tmp = require('../lib/tmp');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        const files = await tmp.list();
        console.log('Temp files:', files.length);
    } else if (subcmd === 'clean' || subcmd === 'clear' || subcmd === 'wipe') {
        await tmp.clear();
        console.log('Temp files cleaned');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        const content = args.slice(1).join(' ') || 'temp';
        const key = await tmp.put(content);
        console.log('Created temp file:', key);
    } else if (subcmd === 'stats' || subcmd === 'info' || subcmd === 'status') {
        const files = await tmp.list();
        console.log('Temp stats:');
        console.log('  Files:', files.length);
    } else {
        console.log('Usage: vant tmp <command>');
        process.exit(1);
    }
}

run().catch(console.error);
