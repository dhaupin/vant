#!/usr/bin/env node
/**
 * Vant Agora CLI — the mesh surface (pass 56 / Wave A, prd-mesh.md)
 *
 * Cross-node agora operations over the crew-bus, as a CLI. Every gate
 * (scope, registry, quarantine, one vote) stays OWNER-side — this CLI
 * only carries the node's configured bus + agentId.
 *
 * Prerequisite: the node is configured + the sync dispatchers installed:
 *   crewBus.configure({ name, port, secret, agentId });
 *   require('../lib/agora-sync').install(crewBus.default);
 * (A future `vant genesis` pass wires this boot flow into config.)
 *
 * Usage:
 *   vant agora nodes                          # the mesh roster as this node sees it
 *   vant agora status                         # sync surface status (installed buses, pending)
 *   vant agora vote <node> <topic> <outcome> [--agent <id>] [--timeout <ms>]
 *   vant agora pull <node> <topic>            # pull + merge a peer's ledger
 *   vant agora push <node> <topic>            # push a local ledger to a peer
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help' || subcmd === 'help') {
    console.log(`
Vant Agora — cross-node agora operations over the crew-bus

Usage:
  vant agora nodes                                   List bus peers + node identity
  vant agora status                                  Sync surface status
  vant agora vote <node> <topic> <outcome> [--agent <id>] [--timeout <ms>]
  vant agora pull <node> <topic>                     Pull + merge a peer's ledger
  vant agora push <node> <topic>                     Push a local ledger to a peer

The topic OWNER runs its full local gate stack (scope, registry vetting,
quarantine, one vote) and acks the verdict. Merges re-derive status
locally — the wire can never declare a topic passed.

Node setup (until \`vant genesis\` lands):
  crewBus.configure({ name, port, secret, agentId });
  require('./lib/agora-sync').install(crewBus.default);
`);
    process.exit(0);
}

function argFlag(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

async function main() {
    const agoraSync = require('../lib/agora-sync');
    const crewBus = require('../lib/crew-bus');

    if (subcmd === 'status') {
        console.log(JSON.stringify(agoraSync.status(), null, 2));
        return;
    }

    if (subcmd === 'nodes') {
        const st = crewBus.status();
        console.log(JSON.stringify({
            self: { name: st.name, agentId: st.agentId, configured: st.configured, listening: st.listening },
            peers: st.peers
        }, null, 2));
        return;
    }

    const [cmd, node, topic, outcome] = args;
    if (cmd === 'vote') {
        if (!node || !topic || !outcome) {
            console.error('Usage: vant agora vote <node> <topic> <outcome> [--agent <id>] [--timeout <ms>]');
            process.exit(1);
        }
        const opts = { timeoutMs: parseInt(argFlag('--timeout'), 10) || 8000 };
        const agent = argFlag('--agent');
        if (agent) opts.agentId = agent;
        const r = await agoraSync.vote(crewBus.default, node, topic, outcome, opts);
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.voted ? 0 : 1);
    }

    if (cmd === 'pull') {
        if (!node || !topic) {
            console.error('Usage: vant agora pull <node> <topic>');
            process.exit(1);
        }
        const r = await agoraSync.pull(crewBus.default, node, topic, { timeoutMs: parseInt(argFlag('--timeout'), 10) || 8000 });
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.pulled ? 0 : 1);
    }

    if (cmd === 'push') {
        if (!node || !topic) {
            console.error('Usage: vant agora push <node> <topic>');
            process.exit(1);
        }
        const r = await agoraSync.push(crewBus.default, node, topic);
        console.log(JSON.stringify(r, null, 2));
        process.exit(r.pushed ? 0 : 1);
    }

    console.error('Unknown subcommand: ' + subcmd + ' (try: vant agora help)');
    process.exit(1);
}

main().catch((e) => {
    console.error('❌ Agora CLI:', e.message);
    process.exit(1);
});
