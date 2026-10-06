#!/usr/bin/env node
/**
 * Vant Mesh Status CLI (pass 62 / Wave F, labs/prd-mesh.md)
 *
 * The coordination node's question — "what are my agents working on,
 * what's voted, what's blocked" — answered from ONE node.
 *
 * USAGE:
 *   vant mesh status            # human-readable summary
 *   vant mesh status --json     # JSON mode for CI / agents
 *
 * Read-only. No secrets. Scope stays owner-side: the report shows what
 * THIS node can see, nothing more (the PRD's rule). Every subsystem is
 * probed independently — a broken leg degrades its section, not the run.
 *
 * (pass 67) The report carries the settlements section — the weights &
 * measures leg (frame.md §5 gap 4): claim counts, role split, in-flight
 * invoices. Aggregates only; settlement memo/topic never leave the
 * claims ledger (the Stewardship surface sees counts, not wallets).
 */

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Vant Mesh Status — the coordinator's one-command view (Wave F)

USAGE:
  vant mesh status            Human-readable summary (local node)
  vant mesh status --json     JSON for CI / agents
  vant mesh status --peers    Ask every registered peer for its shareable
                              report and print the federated view
  vant mesh status --peers --json   Federated view as JSON

WHAT IT ANSWERS:
  Who are my peers, what's voted, what's decided, what's traded,
  what's spent, what's SETTLED across nodes, which channels exist,
  what's pending on the wire — from THIS node's point of view
  (scope stays owner-side).

POSTURE:
  Read-only. No secrets. Degraded sections print their error —
  the mesh is observable even when a leg is down.
`);
    process.exit(0);
}

const meshStatus = require('../lib/mesh-status');

// (pass 68 / Wave G) --peers: the federated view. Asks every registered
// peer for its shareable report (pass-65 read-scope filter owner-side),
// aggregates. Degrades per-peer; the local report is unchanged.
// (Wrapped in an async main — require() + top-level await is the
// ERR_AMBIGUOUS_MODULE_SYNTAX trap, learned 2026-09-21 and re-proven here.)
async function main() {
    if (args.includes('--peers')) {
        const { createBus } = require('../lib/crew-bus');
        const bus = createBus();
        const name = process.env.VANT_NODE_NAME || 'mesh-status-cli';
        const port = parseInt(process.env.VANT_NODE_PORT, 10) || 4899;
        const secret = process.env.VANT_MESH_SECRET || 'vant-mesh';
        try {
            bus.configure({ name, port, secret, agentId: process.env.VANT_NODE_AGENT || null });
            const { buildFederatedReport, renderFederated } = meshStatus;
            const fed = await buildFederatedReport(bus, { timeoutMs: parseInt(process.env.VANT_MESH_TIMEOUT, 10) || 8000 });
            if (args.includes('--json')) {
                console.log(JSON.stringify(fed, null, 2));
            } else {
                console.log(renderFederated(fed));
            }
            process.exit(0);
        } catch (e) {
            console.error('mesh status --peers failed: ' + e.message);
            process.exit(1);
        }
    }

    const { report, text } = meshStatus.status();

    if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(0);
    }

    console.log(text);
    process.exit(0);
}

main().catch((e) => {
    console.error('mesh status failed: ' + e.message);
    process.exit(1);
});
