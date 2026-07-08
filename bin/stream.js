#!/usr/bin/env node
/**
 * Vant Stream CLI
 * Stream operations
 * 
 * Usage:
 *   vant stream list               # List streams
 *   vant stream create <name>      # Create stream
 *   vant stream push <name> <data> # Push to stream
 *   vant stream pull <name>        # Pull from stream
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Stream CLI - Stream operations

Usage:
  vant stream list                   List streams
  vant stream create <name>         Create stream
  vant stream push <name> <data>    Push data to stream
  vant stream pull <name>           Pull from stream
  vant stream delete <name>         Delete stream
`);
    process.exit(0);
}

function run() {
    const stream = require('../lib/stream');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Streams: (use stream.list() for actual list)');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant stream create <name>');
            process.exit(1);
        }
        console.log('Creating stream:', name);
    } else if (subcmd === 'push' || subcmd === 'send' || subcmd === 'write') {
        const name = args[1];
        const data = args.slice(2).join(' ');
        if (!name || !data) {
            console.error('Usage: vant stream push <name> <data>');
            process.exit(1);
        }
        console.log('Pushing to', name + ':', data);
    } else if (subcmd === 'pull' || subcmd === 'read' || subcmd === 'recv') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant stream pull <name>');
            process.exit(1);
        }
        console.log('Pulling from:', name);
    } else if (subcmd === 'delete' || subcmd === 'remove' || subcmd === 'destroy') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant stream delete <name>');
            process.exit(1);
        }
        console.log('Deleting stream:', name);
    } else {
        console.log('Usage: vant stream <command>');
        process.exit(1);
    }
}

run();
