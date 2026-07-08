#!/usr/bin/env node
/**
 * Vant Remote CLI
 * Remote operations and SSH
 * 
 * Usage:
 *   vant remote list           # List remote hosts
 *   vant remote add <name> <host> # Add remote host
 *   vant remote exec <host> <cmd> # Execute remote command
 *   vant remote ssh <host>     # SSH to host
 *   vant remote copy <src> <dst> # Copy files
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Remote CLI - Remote operations

Usage:
  vant remote list               List configured remotes
  vant remote add <name> <host>  Add remote host
  vant remote remove <name>      Remove remote
  vant remote exec <host> <cmd>  Execute command remotely
  vant remote ssh <host>         SSH to host
  vant remote copy <src> <dst>  Copy files (scp)
  vant remote status            Show connection status
`);
    process.exit(0);
}

function run() {
    const remote = require('../lib/remote');
    
    if (subcmd === 'list' || subcmd === 'ls') {
        console.log('Configured remotes:');
        console.log('  (use remote.add() to add hosts)');
    } else if (subcmd === 'add') {
        const name = args[1];
        const host = args[2];
        if (!name || !host) {
            console.error('Usage: vant remote add <name> <host>');
            process.exit(1);
        }
        console.log('Adding remote:', name, '->', host);
    } else if (subcmd === 'remove' || subcmd === 'rm') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant remote remove <name>');
            process.exit(1);
        }
        console.log('Removing remote:', name);
    } else if (subcmd === 'exec' || subcmd === 'run') {
        const host = args[1];
        const cmd = args.slice(2).join(' ');
        if (!host || !cmd) {
            console.error('Usage: vant remote exec <host> <command>');
            process.exit(1);
        }
        console.log('Executing on', host + ':', cmd);
    } else if (subcmd === 'ssh') {
        const host = args[1];
        if (!host) {
            console.error('Usage: vant remote ssh <host>');
            process.exit(1);
        }
        console.log('SSH to:', host);
    } else if (subcmd === 'copy' || subcmd === 'scp') {
        const src = args[1];
        const dst = args[2];
        if (!src || !dst) {
            console.error('Usage: vant remote copy <source> <dest>');
            process.exit(1);
        }
        console.log('Copying:', src, '->', dst);
    } else if (subcmd === 'status') {
        console.log('Remote status:');
        console.log('  (configure in .vant/remotes.json)');
    } else {
        console.log('Usage: vant remote <command>');
        process.exit(1);
    }
}

run();
