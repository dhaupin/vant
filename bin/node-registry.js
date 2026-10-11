#!/usr/bin/env node
/**
 * Vant Node Registry - Node registration
 *
 * (pass 188) WIRED — every verb now routes through lib/node-registry.js
 * (the peer registry behind consensus's vote-verification anchor), which
 * hydrates/persists through the shared state spine
 * (models/private/<brain>/state/node-registry.json, tree-tier mirrored).
 * Previously every verb printed canned strings while the real registry
 * sat wired to consensus but unreachable from the CLI.
 *
 * Usage:
 *   vant node-registry list         # List known peers (with refresh)
 *   vant node-registry register     # Register this node (or --id/--name/--host/--port)
 *   vant node-registry unregister   # Unregister a node (--id required)
 *   vant node-registry status       # Registry stats (total/alive/joining/dead)
 */

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action || action.startsWith('-')) {
    console.log(`
Vant Node Registry - Node registration (backed by lib/node-registry.js)

USAGE:
  vant node-registry list                          # List known peers
  vant node-registry register [--id ID] [--name N] # Register this node
                                     [--host H] [--port P]
  vant node-registry unregister --id ID            # Unregister a node
  vant node-registry status                        # Registry stats

NOTES:
  - The peer table persists per brain (state/node-registry.json) via the
    state spine; quarantine-gated ids are refused (E_QUARANTINED).
  - unregister is a tombstone: a re-hydrate will not resurrect it.

EXAMPLES:
  vant node-registry list
  vant node-registry register --id aria --name aria --host 127.0.0.1 --port 3100
  vant node-registry unregister --id aria
`);
    process.exit(0);
}

function opt(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

function main() {
    const registry = require('../lib/node-registry');

    switch (action) {
        case 'list':
        case 'ls': {
            // Adopt peers registered by other processes first (throttled).
            registry.refresh();
            const nodes = registry.list();
            const alive = nodes.filter(n => n.status === 'alive').length;
            console.log('Registered Nodes: (' + nodes.length + ', ' + alive + ' alive)');
            if (nodes.length === 0) console.log('  (none — register with: vant node-registry register)');
            for (const n of nodes) {
                const age = Math.round((Date.now() - n.lastSeen) / 1000);
                console.log(`  ${n.id}  ${n.name}  ${n.host}:${n.port}  ${n.status}  (lastSeen ${age}s ago)`);
            }
            break;
        }

        case 'register': {
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
            break;
        }

        case 'unregister': {
            const id = opt('--id') || args[1];
            if (!id) {
                console.error('Usage: vant node-registry unregister --id <nodeId>');
                process.exit(1);
            }
            const removed = registry.unregister(id);
            if (removed) {
                console.log('✅ Node unregistered: ' + id + '  (tombstoned — will not re-hydrate)');
            } else {
                console.error('✗ Node not found: ' + id);
                process.exit(1);
            }
            break;
        }

        case 'status': {
            registry.refresh();
            const stats = registry.getStats();
            console.log('Node Registry Status:');
            console.log('  Nodes: ' + stats.total);
            console.log('  Alive: ' + stats.alive);
            console.log('  Joining: ' + stats.joining);
            console.log('  Dead (>60s stale): ' + stats.dead);
            const root = registry._treeRoot();
            if (root) console.log('  Tree root: ' + root.substring(0, 16) + '… (state-spine mirrored)');
            break;
        }

        default:
            console.log('Unknown action:', action);
            console.log('Run: vant node-registry --help');
    }
}

try {
    main();
} catch (e) {
    console.error('node-registry: ' + (e.code ? '[' + e.code + '] ' : '') + e.message);
    process.exit(1);
}
