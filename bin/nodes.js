#!/usr/bin/env node
/**
 * Vant Nodes CLI
 * Peer discovery and node registry (lib/node-registry.js)
 *
 * (pass 189) WIRED. discover/ping/info/register printed canned strings;
 * metrics read nonexistent fields (stats.count/active vs the real
 * stats.total/alive/joining/dead). All verbs now run the real registry —
 * the same lib consensus anchors its vote-verification on. Thin aliases
 * around the same lib as `vant node-registry` (that CLI has register/
 * unregister flags; this one is the discovery view).
 *
 * Usage:
 *   vant nodes list              # List known nodes (refresh-first)
 *   vant nodes discover          # Discover live peers (same as list)
 *   vant nodes ping <node>       # Heartbeat-check a node's liveness
 *   vant nodes info <node>       # One node's full entry
 *   vant nodes register          # Register this node
 *   vant nodes status            # Node stats (total/alive/joining/dead)
 *   vant nodes metrics           # Same stats, metric labels
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Nodes CLI - Peer discovery and registry (lib/node-registry.js)

Usage:
  vant nodes list              List known nodes (adopts peer registrations)
  vant nodes discover          Discover live peers
  vant nodes ping <node>       Liveness check (heartbeat a known node)
  vant nodes info <node>       Node entry (JSON)
  vant nodes register          Register this node (--id/--name/--host/--port)
  vant nodes status            Node stats: total/alive/joining/dead
  vant nodes metrics           The same stats, metric style

Note: peer registration persists per brain through the state spine.
`);
    process.exit(0);
}

function opt(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

async function run() {
    const registry = require('../lib/node-registry');

    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'peers' || subcmd === 'discover' || subcmd === 'scan') {
        // Admin other processes' registrations into this view first.
        registry.refresh();
        const peers = registry.discover();
        console.log('Known nodes (' + peers.length + '):');
        if (peers.length === 0) {
            console.log('  (none — register with: vant nodes register)');
        }
        for (const p of peers) {
            const age = Math.round((Date.now() - p.lastSeen) / 1000);
            console.log(`  ${p.id}  ${p.name}  ${p.host}:${p.port}  ${p.status}  (lastSeen ${age}s ago)`);
        }
    } else if (subcmd === 'ping' || subcmd === 'check') {
        const node = args[1];
        if (!node) {
            console.error('Usage: vant nodes ping <node>');
            process.exit(1);
        }
        registry.refresh();
        const entry = registry.get(node);
        if (!entry) {
            console.error('✗ Unknown node: ' + node);
            process.exit(1);
        }
        // Ping = heartbeat the entry and report the fresh age (the registry's
        // liveness probe: status flips to 'alive', lastSeen resets).
        const updated = registry.heartbeat(node);
        const age = Math.round((Date.now() - updated.lastSeen) / 1000);
        console.log(`✓ ${node} alive (${updated.status}, lastSeen ${age}s ago)`);
    } else if (subcmd === 'info') {
        const node = args[1];
        if (!node) {
            console.error('Usage: vant nodes info <node>');
            process.exit(1);
        }
        registry.refresh();
        const entry = registry.get(node);
        if (!entry) {
            console.error('✗ Unknown node: ' + node);
            process.exit(1);
        }
        console.log(JSON.stringify(entry, null, 2));
    } else if (subcmd === 'register' || subcmd === 'add') {
        const entry = registry.register({
            id: opt('--id'),
            name: opt('--name'),
            host: opt('--host'),
            port: opt('--port') !== undefined ? parseInt(opt('--port'), 10) : undefined
        });
        if (entry && entry.error) {
            console.error('✗ Registration refused: ' + (entry.code || 'ERROR') + (entry.id ? ' (' + entry.id + ')' : ''));
            process.exit(1);
        }
        console.log('✅ Node registered: ' + entry.id + '  ' + entry.host + ':' + entry.port + '  ' + entry.status);
    } else if (subcmd === 'status' || subcmd === 'stats') {
        registry.refresh();
        printStats('Node status:');
    } else if (subcmd === 'metrics') {
        registry.refresh();
        printStats('Node metrics:');
    } else {
        console.log('Usage: vant nodes <command>');
        console.log('Commands: list | discover | ping <id> | info <id> | register | status | metrics');
        process.exit(1);
    }
}

function printStats(title) {
    const stats = require('../lib/node-registry').getStats();
    console.log(title);
    console.log('  Registered (total): ' + stats.total);
    console.log('  Alive: ' + stats.alive);
    console.log('  Joining: ' + stats.joining);
    console.log('  Dead (>60s stale): ' + stats.dead);
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
