#!/usr/bin/env node
/**
 * Vant Notices CLI (pass 68 / Wave I — frame.md §5 gap 5: the noticeboard)
 *
 * The board is INTER-org broadcast + durable catch-up (the forum/agora
 * stays where deliberation happens). Usage:
 *
 *   vant notices post "<title>" [--body "..."] [--ttl-ms N]
 *   vant notices list [--json]
 *   vant notices pull [--all | <peer>]     catch up after downtime
 *   vant notices broadcast                 push the board to every peer
 *   vant notices bridge <topic>            decision → board (unscoped only)
 *
 * ENV (the commons key ring):
 *   VANT_NODE_NAME    this node's name on the wire (default notices-cli)
 *   VANT_NODE_PORT    local port for the CLI bus (default 4898)
 *   VANT_MESH_SECRET  the RING secret — every peer is signed with it
 *   VANT_MESH_TIMEOUT pull timeout ms (default 5000)
 *
 * Peers are read from the node-registry (the vetted roster genesis/rite
 * admissions maintain) — the same source `admit` broadcasts to.
 */

const args = process.argv.slice(2);
const sub = args[0] || 'help';

if (sub === '-h' || sub === '--help' || sub === 'help') {
    console.log(`
Vant Notices — the federation noticeboard (Wave I)

USAGE:
  vant notices post "<title>" [--body "..."] [--ttl-ms N]
  vant notices list [--json]
  vant notices pull [--all | <peer>]
  vant notices broadcast
  vant notices bridge <topic>

NOTES:
  ttl-ms 0 (default) = sticky. The board is capped (oldest evicted),
  merge-only across nodes, and durable in state/notices.json.

ENV:
  VANT_NODE_NAME, VANT_NODE_PORT, VANT_MESH_SECRET, VANT_MESH_TIMEOUT
`);
    process.exit(0);
}

function flag(name, fallback) {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

async function main() {
    const notices = require('../lib/notices');
    const { createBus } = require('../lib/crew-bus');

    if (sub === 'post' || sub === 'list' || sub === 'bridge') {
        // Local board ops: no bus needed unless one was handed in (the
        // note's `from` is prettier with the node name).
        if (sub === 'post') {
            const title = args[1];
            if (!title) { console.error('Usage: vant notices post "<title>" [--body "..."] [--ttl-ms N]'); process.exit(1); }
            const r = notices.post({ title, body: flag('--body', ''), ttlMs: parseInt(flag('--ttl-ms', '0'), 10) || 0 });
            if (!r.ok) { console.error('post failed: ' + r.reason); process.exit(1); }
            console.log('✓ posted ' + r.note.id + (r.note.ttlMs ? ' (ttl ' + r.note.ttlMs + 'ms)' : ' (sticky)'));
            process.exit(0);
        }
        if (sub === 'list') {
            const board = notices.list({});
            if (args.includes('--json')) { console.log(JSON.stringify(board, null, 2)); process.exit(0); }
            if (!board.length) { console.log('(board empty)'); process.exit(0); }
            for (const n of board) {
                const when = new Date(n.ts).toISOString();
                console.log('[' + when + '] ' + n.title + '  — ' + n.from + (n.ref ? ' (ref: ' + n.ref + ')' : '') + (n.ttlMs ? ' (ttl ' + n.ttlMs + 'ms)' : ''));
                if (n.body) console.log('    ' + n.body.split('\n').join('\n    '));
            }
            process.exit(0);
        }
        if (sub === 'bridge') {
            const topic = args[1];
            if (!topic) { console.error('Usage: vant notices bridge <topic>'); process.exit(1); }
            const r = notices.bridgeDecision(topic);
            if (!r.bridged) { console.error('bridge refused (' + r.reason + ')' + (r.reason === 'scoped_topic' ? ' — scoped topics are not nameable on the commons board' : '')); process.exit(1); }
            console.log('✓ bridged: ' + r.note.title);
            process.exit(0);
        }
    }

    // Wire ops (pull/broadcast): boot a CLI bus signed with the ring secret.
    const name = process.env.VANT_NODE_NAME || 'notices-cli';
    const port = parseInt(process.env.VANT_NODE_PORT, 10) || 4898;
    const secret = process.env.VANT_MESH_SECRET || 'vant-mesh';
    const timeoutMs = parseInt(process.env.VANT_MESH_TIMEOUT, 10) || 5000;
    const bus = createBus();
    bus.configure({ name, port, secret, agentId: process.env.VANT_NODE_AGENT || null });
    notices.install(bus);

    if (sub === 'pull') {
        // Ring roster from the node-registry (vetted principals carry the
        // NODE NAME — pass-59). Signed with the shared ring secret.
        let peers = [];
        try {
            peers = require('../lib/node-registry').list()
                .map((p) => ({ name: p.name, host: p.host || '127.0.0.1', port: p.port }))
                .filter((p) => p.name && p.name !== name);
        } catch (e) { peers = []; }
        const targetArg = args[1];
        const targets = (!targetArg || targetArg === '--all') ? peers : peers.filter((p) => p.name === targetArg);
        if (!targets.length) {
            console.log(targetArg && targetArg !== '--all' ? ('no registered peer named ' + targetArg) : '(no registered peers to pull from)');
            process.exit(0);
        }
        let any = false;
        for (const p of targets) {
            bus.registerNode({ name: p.name, url: 'http://' + p.host + ':' + p.port, secret });
            const r = await notices.pull(bus, p.name, { timeoutMs });
            any = any || (r.ok && r.pulled > 0);
            console.log((r.ok ? '✓ ' : '✗ ') + p.name + ': ' + (r.ok ? ('pulled ' + r.pulled + ' note(s)') : r.reason));
        }
        console.log(any ? 'Board updated.' : 'Board unchanged.');
        process.exit(0);
    }

    if (sub === 'broadcast') {
        let peers = [];
        try {
            peers = require('../lib/node-registry').list()
                .map((p) => ({ name: p.name, host: p.host || '127.0.0.1', port: p.port }))
                .filter((p) => p.name && p.name !== name);
        } catch (e) { peers = []; }
        for (const p of peers) {
            bus.registerNode({ name: p.name, url: 'http://' + p.host + ':' + p.port, secret });
        }
        const results = await notices.broadcast(bus);
        for (const r of results) {
            console.log((r.ok ? '✓ ' : '✗ ') + r.node + (r.ok ? '' : (': ' + (r.error || 'failed'))));
        }
        if (!results.length) console.log('(no registered peers to broadcast to)');
        process.exit(0);
    }

    console.log('Unknown subcommand: ' + sub + ' — try: post | list | pull | broadcast | bridge');
    process.exit(1);
}

main().catch((e) => {
    console.error('notices failed: ' + e.message);
    process.exit(1);
});
