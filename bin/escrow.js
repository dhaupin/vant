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

async function run() {
    const escrow = require('../lib/escrow');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const status = await escrow.getStatus();
        console.log('Escrow Status:');
        console.log('  Held items:', status.held || 0);
        console.log('  Budget used:', status.used || 0);
        console.log('  Budget total:', status.budget || 0);
    } else if (subcmd === 'hold' || subcmd === 'lock' || subcmd === 'create') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow hold <id>');
            process.exit(1);
        }
        const result = await escrow.hold(id);
        console.log('Held:', id);
        console.log('  Result:', result.held ? 'SUCCESS' : 'FAILED');
    } else if (subcmd === 'release' || subcmd === 'unlock' || subcmd === 'unhold') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow release <id>');
            process.exit(1);
        }
        const result = await escrow.release(id);
        console.log('Released:', id);
        console.log('  Result:', result.released ? 'SUCCESS' : 'FAILED');
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        const status = await escrow.getStatus();
        console.log('Escrow items:', status.items || []);
    } else {
        console.log('Usage: vant escrow <command>');
        process.exit(1);
    }
}

run().catch(console.error);
