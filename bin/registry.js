#!/usr/bin/env node
/**
 * Vant Registry - Agent registry
 *
 * (pass 189) REWIRED. The old verbs called the lib with wrong shapes:
 * `register(key, value)` vs the real `register(agent)` (an AGENT registry —
 * name/type/purpose/values, trust-gated), `get(key)` awaiting a key->value
 * store (real get(name) is sync on a Map). Verbs now match lib/registry.js:
 *
 *   vant registry list / get <name> / register <name> [type] / remove <name>
 *   vant registry count / summary
 *
 * Usage:
 *   vant registry list                   # List registered agents
 *   vant registry get <name>             # One agent
 *   vant registry register <name> [type] # Register an agent (trust-gated)
 *   vant registry remove <name>          # Remove an agent
 *   vant registry count                  # Count
 *   vant registry summary                # Totals by type
 */

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Registry - Agent registry (lib/registry.js)

USAGE:
  vant registry list                    # List registered agents
  vant registry get <name>              # One agent (JSON)
  vant registry register <name> [type]  # Register an agent (trust-gated)
  vant registry remove <name>           # Remove
  vant registry count                   # Total agents
  vant registry summary                 # Count by type

NOTE: this is the AGENT trust registry (quarantine-gated), not a key-value
store. For per-brain key-value settings use: vant config set/get.
`);
    process.exit(0);
}

async function main() {
    let mod;
    try {
        mod = require('../lib/registry');
    } catch (e) {
        console.error('Registry module not available: ' + e.message);
        process.exit(1);
    }

    switch (action) {
        case 'list':
        case 'ls': {
            const agents = mod.list();
            console.log('Registered agents (' + agents.length + '):');
            if (agents.length === 0) console.log('  (none)');
            for (const a of agents) {
                console.log(`  ${a.name}  ${a.type || '?'}  ${(a.status === 'quarantined') ? 'QUARANTINED' : (a.trusted ? 'trusted' : 'unonly-trusted')}  ${a.purpose || ''}`);
            }
            break;
        }

        case 'get': {
            const name = args[1];
            if (!name) { console.error('Usage: vant registry get <name>'); process.exit(1); }
            const agent = mod.get(name);
            if (!agent) {
                console.error('✗ Not registered: ' + name);
                process.exit(1);
            }
            console.log(JSON.stringify(agent, null, 2));
            break;
        }

        case 'register':
        case 'add': {
            const name = args[1];
            if (!name) { console.error('Usage: vant registry register <name> [type]'); process.exit(1); }
            const type = args[2] || 'Assistant';
            const result = await mod.register({ name, type });
            if (result && result.registered === false) {
                console.error('✗ Registration refused: ' + (result.reason || 'unknown'));
                process.exit(1);
            }
            console.log('✅ Registered: ' + name + ' (' + type + ')');
            break;
        }

        case 'remove':
        case 'delete':
        case 'del': {
            const name = args[1];
            if (!name) { console.error('Usage: vant registry remove <name>'); process.exit(1); }
            const removed = mod.remove(name);
            if (!removed) {
                console.error('✗ Not found: ' + name);
                process.exit(1);
            }
            console.log('✅ Removed: ' + name);
            break;
        }

        case 'count':
            console.log('Total agents: ' + mod.count());
            break;

        case 'summary':
            console.log(JSON.stringify(mod.summary(), null, 2));
            break;

        default:
            console.log('Unknown action:', action);
            console.log('Run: vant registry --help');
            process.exit(1);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
