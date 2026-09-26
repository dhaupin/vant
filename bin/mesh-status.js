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
 */

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Vant Mesh Status — the coordinator's one-command view (Wave F)

USAGE:
  vant mesh status            Human-readable summary
  vant mesh status --json     JSON for CI / agents

WHAT IT ANSWERS:
  Who are my peers, what's voted, what's decided, what's traded,
  what's spent, which channels exist, what's pending on the wire —
  from THIS node's point of view (scope stays owner-side).

POSTURE:
  Read-only. No secrets. Degraded sections print their error —
  the mesh is observable even when a leg is down.
`);
    process.exit(0);
}

const { status } = require('../lib/mesh-status');
const { report, text } = status();

if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
}

console.log(text);
process.exit(0);
