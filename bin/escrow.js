#!/usr/bin/env node
/**
 * Vant Escrow CLI
 * Escrow operations
 * 
 * Usage:
 *   vant escrow status                       # Show escrow status
 *   vant escrow hold <id>                    # Put in escrow
 *   vant escrow release <id>                 # Release from escrow
 *   vant escrow pool <ws> <amount>           # Set workspace org-pool budget
 *   vant escrow pool <ws>                    # Show workspace org-pool budget
 *   vant escrow cap <ws> <agentId> <limit>   # Cap a member's pool draw
 *   vant escrow pools                        # List all workspace pools
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Escrow CLI - Escrow operations

Usage:
  vant escrow status                    Show escrow status
  vant escrow hold <id>                 Put item in escrow
  vant escrow release <id>              Release from escrow
  vant escrow list                      List escrow items
  vant escrow pool <ws> <amount>        Set workspace org-pool budget
  vant escrow pool <ws>                 Show workspace org-pool budget
  vant escrow cap <ws> <agentId> <n>    Cap a member's pool draw
  vant escrow pools                     List all workspace pools
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
    } else if (subcmd === 'pool' || subcmd === 'budget') {
        // (pass 83) Workspace org-pool budget. Setting REQUIRES the caller
        // to hold admin in that workspace (registry-verified, not
        // self-declared) - same gate as the MCP tool.
        const ws = args[1];
        if (!ws) { console.error('Usage: vant escrow pool <ws> [amount]'); process.exit(1); }
        const amount = args[2];
        if (amount === undefined) {
            const pool = escrow.getWorkspacePool(ws);
            console.log('Workspace pool ' + ws + ':');
            console.log('  spent ' + (pool.spent || 0) + ' / ' + (pool.limit || 0) + ' (available ' + (pool.available || 0) + ')');
            return;
        }
        if (!Number.isFinite(parseFloat(amount))) {
            console.error('Amount must be a number');
            process.exit(1);
        }
        const adminId = process.env.VANT_ADMIN_ID || 'cli-admin';
        const habitat = require('../lib/habitat');
        const h = await habitat.getSharedReady();
        const roles = h.getUserRoles(ws, adminId);
        if (!roles.includes('admin')) {
            console.error('✗ Access denied: admin role required in workspace ' + ws);
            console.error('  (grant one: vant habitat grant ' + ws + ' admin <your-user-id>, or set VANT_ADMIN_ID)');
            process.exit(1);
        }
        const pool = escrow.setWorkspaceBudget(ws, parseFloat(amount));
        console.log('✓ Workspace pool ' + ws + ': limit ' + pool.limit + ' (admin: ' + adminId + ')');
    } else if (subcmd === 'cap' || subcmd === 'member') {
        // (pass 83) Member cap on a workspace pool draw (admin-gated).
        const [ws, agentId, limitArg] = [args[1], args[2], args[3]];
        if (!ws || !agentId || !limitArg) { console.error('Usage: vant escrow cap <ws> <agentId> <limit>'); process.exit(1); }
        const limit = parseFloat(limitArg);
        if (!Number.isFinite(limit)) { console.error('Limit must be a number'); process.exit(1); }
        const adminId = process.env.VANT_ADMIN_ID || 'cli-admin';
        const habitat = require('../lib/habitat');
        const h = await habitat.getSharedReady();
        const roles = h.getUserRoles(ws, adminId);
        if (!roles.includes('admin')) {
            console.error('✗ Access denied: admin role required in workspace ' + ws);
            process.exit(1);
        }
        const member = escrow.setWorkspaceMemberLimit(ws, agentId, limit);
        console.log('✓ Member cap ' + agentId + ' @ ' + ws + ': limit ' + member.limit);
    } else if (subcmd === 'pools') {
        // (pass 83) All workspace pools.
        const pools = escrow.listWorkspacePools();
        console.log('Workspace pools:', pools.length ? '' : '(none)');
        for (const p of pools) {
            console.log('  ' + p.workspace + ': spent ' + p.spent + ' / ' + p.limit + ' (available ' + p.available + ')');
        }
    } else {
        console.log('Usage: vant escrow <command>');
        process.exit(1);
    }
}

run().catch(console.error);
