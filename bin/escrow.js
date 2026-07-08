#!/usr/bin/env node
/**
 * Vant Escrow CLI
 * Escrow operations
 * 
 * Usage:
 *   vant escrow status             # Show escrow status
 *   vant escrow hold <id>         # Put in escrow
 *   vant escrow release <id>      # Release from escrow
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Escrow CLI - Escrow operations

Usage:
  vant escrow status                Show escrow status
  vant escrow hold <id>            Put item in escrow
  vant escrow release <id>          Release from escrow
  vant escrow list                  List escrow items
`);
    process.exit(0);
}

function run() {
    const escrow = require('../lib/escrow');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Escrow status: (use escrow.status() to get)');
    } else if (subcmd === 'hold' || subcmd === 'lock' || subcmd === 'create') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow hold <id>');
            process.exit(1);
        }
        console.log('Putting in escrow:', id);
    } else if (subcmd === 'release' || subcmd === 'unlock' || subcmd === 'unhold') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow release <id>');
            process.exit(1);
        }
        console.log('Releasing from escrow:', id);
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Escrow items: (use escrow.list() to list)');
    } else {
        console.log('Usage: vant escrow <command>');
        process.exit(1);
    }
}

run();
