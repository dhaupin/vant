#!/usr/bin/env node
/**
 * Vant Agents CLI — REAL subcommands over lib/agents (prime #106/#107).
 *
 * The pre-88 CLI was a stub: spawn/kill printed "Spawning agent: X" without
 * touching lib/agents, status/info handlers were duplicated (second branch
 * dead), and subcommand-level --help was eaten as the agent name. Every
 * subcommand now runs the real library path, and mutating subcommands
 * (spawn/kill/prune) drain the serialized save chain before exit — the
 * fire-and-forget save used to race process exit and silently lose the
 * mutation (issue #109).
 *
 * CAPABILITIES (prime #108): invoking `spawn`/`kill` IS operator intent, so
 * those subcommands boot the security chain and grant the operator caps
 * in-process (same pattern as `vant org demo`). For grants that PERSIST
 * across processes, run `vant org grant` once — boot now hydrates
 * orgchart.operatorCapabilities in every fresh process.
 *
 * Usage:
 *   vant agents list                        List agents
 *   vant agents spawn <name> [--role r] [--brain b]   Spawn an agent
 *   vant agents kill <id>                   Terminate an agent
 *   vant agents info <id>                   Show one agent record
 *   vant agents status                      Registry status
 *   vant agents prune                       Drop stale idle agents
 *
 * Operational limits: max 4 concurrent agents (crew of 4), spawn rate limit
 * 10/min (config agents.spawnRateLimit), agents share brain context.
 */

const args = process.argv.slice(2).filter(a => a !== '-h' && a !== '--help');
const subcmd = args[0] || 'list';

function usage() {
    console.log(`
Vant Agents CLI — real subcommands over lib/agents

Usage:
  vant agents list                              List agents
  vant agents spawn <name> [--role r] [--brain b]   Spawn an agent
  vant agents kill <id>                         Terminate an agent
  vant agents info <id>                         Show one agent record
  vant agents status                            Registry status
  vant agents prune                             Drop stale idle agents

Limits: max 4 concurrent agents (crew of 4); spawn rate 10/min
(agents.spawnRateLimit); agents share brain context.

Grants: spawn/kill self-grant caps in-process (operator intent). For a
grant that persists across processes run: vant org grant
`);
}

// Subcommand-level --help (prime #107): previously only args[0] was guarded,
// so `vant agents spawn --help` tried to spawn an agent named "--help".
if (args[0] === '-h' || args[0] === '--help' || process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    process.exit(0);
}

function flagValue(name) {
    const i = args.indexOf(name);
    return (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : undefined;
}

// (prime #108, option 2) Mutation = operator intent: boot the security chain
// and grant the operator caps in-process, mirroring `vant org demo`.
function grantOperator() {
    require('../lib/boot').init({ taskId: 'agents-cli', scopes: ['read', 'write', 'spawn', 'execute'], debug: false });
    require('../lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
}

async function run() {
    const agents = require('../lib/agents');

    switch (subcmd) {
        case 'list':
        case 'ls':
        case 'all': {
            const list = await agents.list();
            console.log('Active Agents:');
            if (!list || list.length === 0) {
                console.log('  (none)');
            } else {
                for (const a of list) {
                    console.log(`  ${a.id}: ${a.name} (${a.state || 'idle'})` + (a.brain ? ' brain:' + a.brain : '') + (a.workspace ? ' ws:' + a.workspace : ''));
                }
            }
            break;
        }

        case 'status': {
            const s = agents.getStatus();
            const list = await agents.list();
            console.log(JSON.stringify({ ...s, listed: (list || []).length }, null, 2));
            break;
        }

        case 'info':
        case 'get':
        case 'show': {
            const id = args[1];
            if (!id) { console.error('Usage: vant agents info <id>'); process.exit(1); }
            const agent = agents.get(id);
            if (!agent) { console.error('Agent ' + id + ' not found'); process.exit(1); }
            console.log(JSON.stringify(agent, null, 2));
            break;
        }

        case 'spawn':
        case 'create':
        case 'new': {
            const name = args[1];
            if (!name || name.startsWith('--')) { console.error('Usage: vant agents spawn <name> [--role r] [--brain b]'); process.exit(1); }
            const role = flagValue('--role');
            const brain = flagValue('--brain');
            const parent = flagValue('--parent');
            grantOperator();
            const a = await agents.spawn({ name, ...(role ? { role } : {}), ...(brain ? { brain } : {}), ...(parent ? { parent } : {}) });
            if (a && a.error) {
                console.error('✗ Spawn failed:', a.error);
                await agents.flush();
                process.exit(1);
            }
            console.log('✓ Spawned agent:', a.id, '-', a.name, '(role: ' + a.role + (a.brain ? ', brain: ' + a.brain : '') + (a.workspace ? ', workspace: ' + a.workspace : '') + ')');
            // (prime #109) Drain the serialized save chain — the fire-and-
            // forget write used to lose the agent on exit.
            await agents.flush();
            console.log('  persisted (agents.json); list it with: vant agents list');
            break;
        }

        case 'kill':
        case 'stop':
        case 'terminate': {
            const id = args[1];
            if (!id || id.startsWith('--')) { console.error('Usage: vant agents kill <id>'); process.exit(1); }
            grantOperator();
            const ok = await agents.kill(id);
            await agents.flush();
            if (!ok) { console.error('✗ Agent ' + id + ' not found'); process.exit(1); }
            console.log('✓ Terminated agent:', id, '(persisted)');
            break;
        }

        case 'prune': {
            grantOperator();
            const r = await agents.prune();
            await agents.flush();
            console.log('✓ Pruned', r.pruned, 'stale idle agents (persisted)');
            break;
        }

        default:
            usage();
            process.exit(1);
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
