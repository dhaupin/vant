#!/usr/bin/env node
/**
 * Vant Sandbox CLI
 * Sandbox management
 * 
 * Usage:
 *   vant sandbox status             # Show sandbox status
 *   vant sandbox create            # Create sandbox
 *   vant sandbox destroy <id>      # Destroy sandbox
 *   vant sandbox list              # List sandboxes
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Sandbox CLI - Sandbox management

Usage:
  vant sandbox status               Show sandbox status
  vant sandbox create              Create sandbox
  vant sandbox destroy <id>        Destroy sandbox
  vant sandbox list                List sandboxes
  vant sandbox info <id>           Show sandbox info
`);
    process.exit(0);
}

function run() {
    const sandbox = require('../lib/sandbox');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Sandbox status:');
        console.log('  (use sandbox.status() for actual status)');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        console.log('Creating sandbox...');
    } else if (subcmd === 'destroy' || subcmd === 'remove' || subcmd === 'delete') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant sandbox destroy <id>');
            process.exit(1);
        }
        console.log('Destroying sandbox:', id);
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Sandboxes: (use sandbox.list() for actual list)');
    } else if (subcmd === 'info' || subcmd === 'show') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant sandbox info <id>');
            process.exit(1);
        }
        console.log('Sandbox info:', id);
    } else {
        console.log('Usage: vant sandbox <command>');
        process.exit(1);
    }
}

run();
