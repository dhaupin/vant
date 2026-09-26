#!/usr/bin/env node
/**
 * Vant Genesis CLI — mesh join ceremony (pass 57 / Wave B, prd-mesh.md)
 *
 * Usage:
 *   vant genesis create --name <node> --agent <id> --port <p> \
 *        --joiner <name> --joiner-agent <id> [--joiner-port <p>] [--jv <org>,<dept>,<team>]
 *   vant genesis join --name <node> --agent <id> --port <p> \
 *        --host <name> [--host-url <url>] [--host-port <p>] [--host-agent <id>] \
 *        --secret <pair-secret>
 *   vant genesis status
 *
 * The pair secret NEVER crosses the wire: `create` prints it ONCE — hand
 * it to the joiner out-of-band (docs, ticket, secret manager). Secrets
 * stay in process memory or env; only the non-secret topology persists
 * to state/genesis.json.
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

function argFlag(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

if (subcmd === '-h' || subcmd === '--help' || subcmd === 'help') {
    console.log(`
Vant Genesis — mesh join ceremony

Usage:
  vant genesis create --name <node> --agent <id> --port <p>
        --joiner <name> --joiner-agent <id> [--joiner-port <p>]
        [--jv <org>,<dept>,<team>]        Host a genesis; prints the PAIR SECRET once
  vant genesis join --name <node> --agent <id> --port <p>
        --host <name> [--host-url <url>] [--host-port <p>] [--host-agent <id>]
        --secret <pair-secret>            Join; ack proves both sides hold the key
  vant genesis status                     Non-secret mesh topology + secret source

Security:
  - The secret never crosses the wire — exchange it out-of-band.
  - Secrets live in process memory (or env: VANT_MESH_SECRET for restarts);
    only non-secret topology persists to state/genesis.json.
  - Re-running create/join re-keys the pair (rotation in one command).
`);
    process.exit(0);
}

async function main() {
    const genesis = require('../lib/genesis');

    if (subcmd === 'status') {
        console.log(JSON.stringify(genesis.status(), null, 2));
        process.exit(0);
    }

    if (subcmd === 'create') {
        const r = await genesis.create({
            name: argFlag('--name'),
            agentId: argFlag('--agent') || undefined,
            port: argFlag('--port') || 4890,
            joiner: {
                name: argFlag('--joiner'),
                agentId: argFlag('--joiner-agent') || undefined,
                port: argFlag('--joiner-port') || 4891
            },
            jv: argFlag('--jv')
                ? (() => { const [org, dept, team] = argFlag('--jv').split(','); return { org, dept, team }; })()
                : undefined
        });
        if (!r.ok) {
            console.error(JSON.stringify(r, null, 2));
            process.exit(1);
        }
        console.log('✓ Host node booted: ' + r.node.name + ' (port ' + r.node.port + ')');
        if (r.jv) console.log('✓ JV org model: team ' + r.jv.team);
        console.log('\nPAIR SECRET (hand to the joiner OUT-OF-BAND — never on the wire):');
        console.log('  ' + r.secret);
        console.log('\nJoiner command:');
        console.log('  vant genesis join --name <joiner-node> --agent ' + (r.node.agentId ? '<joiner-agent>' : '<agent>') +
            ' --port <joiner-port> --host ' + r.node.name + ' --host-port ' + r.node.port + ' --secret <PAIR SECRET>');
        process.exit(0); // keep the bus alive is a future daemon concern
    }

    if (subcmd === 'join') {
        const r = await genesis.join({
            name: argFlag('--name'),
            agentId: argFlag('--agent') || undefined,
            port: argFlag('--port') || 4891,
            host: argFlag('--host'),
            hostUrl: argFlag('--host-url') || undefined,
            hostPort: argFlag('--host-port') || 4890,
            hostAgent: argFlag('--host-agent') || undefined,
            secret: argFlag('--secret'),
            timeoutMs: parseInt(argFlag('--timeout'), 10) || undefined
        });
        if (!r.ok) {
            console.error(JSON.stringify(r, null, 2));
            process.exit(1);
        }
        console.log('✓ Joined mesh: acked by ' + (r.topology && r.topology.peers[0] ? r.topology.peers[0].name : 'host') +
            (r.jv ? ' (JV team ' + r.jv.team + ')' : ''));
        process.exit(0);
    }

    console.error('Unknown subcommand: ' + subcmd + ' (try: vant genesis help)');
    process.exit(1);
}

main().catch((e) => {
    console.error('❌ Genesis:', e.message);
    process.exit(1);
});
