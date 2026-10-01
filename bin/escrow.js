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

    // pass 77: status/list now read the real ledger (gatherState) instead of
    // getStatus() fields that never existed - held/budget used to print as
    // hardcoded zeros.
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const state = escrow.gatherState();
        console.log('Escrow Status:');
        console.log('  Held items:', Object.keys(state.holds || {}).length);
        const agents = Object.entries(state.budgets || {});
        const used = agents.reduce((sum, [, b]) => sum + (b.spent || 0), 0);
        const total = agents.reduce((sum, [, b]) => sum + (b.limit || 0), 0);
        console.log('  Budget used:', used);
        console.log('  Budget total:', total);
        console.log('  Tracked agents:', agents.length);
        console.log('  Approvals:', Object.keys(state.approvals || {}).length);
        console.log('  Quotas:', Object.keys(state.quotas || {}).length);
    } else if (subcmd === 'hold' || subcmd === 'lock' || subcmd === 'create') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow hold <id>');
            process.exit(1);
        }
        const e = escrow.create({});
        const result = await e.hold(id, { via: 'cli' });
        e.save();   // pass 77: persist - module-level helpers build throwaway instances
        console.log('Held:', id);
        console.log('  Result:', result.held ? 'SUCCESS' : 'FAILED (' + (result.reason || 'unknown') + ')');
        console.log('  Note: a hold is a reservation with a timeout - it does not debit budget.');
    } else if (subcmd === 'release' || subcmd === 'unlock' || subcmd === 'unhold') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant escrow release <id>');
            process.exit(1);
        }
        const e = escrow.create({});
        const result = await e.release(id);
        e.save();   // persist
        console.log('Released:', id);
        console.log('  Result:', result.released ? 'SUCCESS' : 'FAILED (not found)');
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        const state = escrow.gatherState();
        const holds = Object.keys(state.holds || {});
        console.log('Escrow items:', holds.length ? holds.join(', ') : '(none)');
        const agents = Object.entries(state.budgets || {});
        if (agents.length) {
            console.log('Budgets:');
            for (const [agent, b] of agents) {
                console.log('  ' + agent + ': spent ' + (b.spent || 0) + ' / ' + (b.limit || 0));
            }
        }
    } else {
        console.log('Usage: vant escrow <command>');
        process.exit(1);
    }
}

run().catch(console.error);
