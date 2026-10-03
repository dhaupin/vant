---
version: 0.8.6
permalink: /operations/notices
layout: default
title: Notices
nav_order: 68
description: The federation noticeboard - inter-org broadcast, durable catch-up, and the decision bridge.
---

# Notices

> The board is the Post: plain announcements any member node can read,
> durable across restarts, catch-up-able after downtime. It is not a
> second forum - deliberation stays in the agora; the board carries
> outcomes and announcements.

## On this page

- [The model](#the-model)
- [CLI reference](#cli-reference)
- [TTL and the cap](#ttl-and-the-cap)
- [Bridging decisions](#bridging-decisions)
- [From agents](#from-agents)
- [Related](#related)

## The model

A note is a small record: `id`, `from`, `title`, `body`, `ts`,
`ttlMs`, and an optional `ref` (a pointer back to wherever it came
from, such as a consensus topic). The board is:

- **Merge-only:** a note id is adopted once; re-posts never overwrite
  (first writer wins, the same rule as member adoption)
- **Capped:** the board holds a bounded number of notes; the oldest
  are evicted by age, not by stickiness
- **Durable:** the board persists in state and survives restarts
- **Push and pull:** you can push your board to peers, and pull a
  peer's board after downtime

Trust posture matches every other leg: registered peers only,
sender-bound replies, wire payloads re-clamped field by field.

## CLI reference

| Command | What it does |
|---------|--------------|
| `vant notices post "<title>"` | Post a note (sticky by default) |
| `vant notices list` | Read the board, newest first (`--json` for agents) |
| `vant notices pull [--all \| <peer>]` | Catch up: adopt a peer's board |
| `vant notices broadcast` | Push your board to every registered peer |
| `vant notices bridge <topic>` | Bridge a consensus decision onto the board |

```bash
# Post with a two-week TTL (0 = sticky)
vant notices post "Q3 platform call set" --body "Thursday 1400 UTC, three orgs" --ttl-ms 1209600000

# Read the board
vant notices list
vant notices list --json

# Catch up after being offline
vant notices pull --all
vant notices pull acme-node

# Push your board out (fire-and-forget per peer)
vant notices broadcast
```

Env for the wire subcommands: `VANT_NODE_NAME`, `VANT_NODE_PORT`,
`VANT_MESH_SECRET` (the ring secret), `VANT_MESH_TIMEOUT`.

## TTL and the cap

`ttl-ms 0` (the default) makes a note sticky: it only leaves the board
through eviction or the cap. A positive TTL expires the note at
`ts + ttlMs`; expired notes are pruned on read, so a reader never sees
a stale note. The board cap evicts the OLDEST notes first - age
decides, not stickiness - so long-lived boards stay bounded for
everyone.

## Bridging decisions

The bridge turns a finished consensus topic into a board note, and it
is deliberately choosy:

- **Unscoped topic:** bridged. The note carries the outcome (status,
  vote count) with the topic as `ref`.
- **Scoped topic:** refused with `scoped_topic`. A scope's existence is
  not nameable on the commons board - members who may see it read the
  agora, and the board carries only what every org may read.

```bash
vant notices bridge forum-q3-platform-call-abc123
# bridge refused (scoped_topic) - scoped topics are not nameable on the commons board
```

For a scoped decision, post the plain notice yourself (outcome facts,
no scoped name) - that is the pass-52 broadcast pattern, one call. See
the [Steward Runbook](/vant/operations/steward-runbook) for the full
group flow.

## From agents

The board is a lib surface agents use directly:

```js
const notices = require('./lib/notices');
notices.install(crewBus);          // wire legs (registered peers only)
notices.post({ title: 'Deploy window Friday 02:00Z', ttlMs: 3 * 24 * 3600 * 1000 });
const board = notices.list();
const r = notices.bridgeDecision(topic);  // { bridged } or { bridged: false, reason }
```

## Related

- [Federation](/vant/multi-agent/federation) - where the board sits in the mesh
- [Federation Playbooks](/vant/operations/federation-playbooks) - catch-up and broadcast in context
- [Agora](/vant/operations/agora) - the decision layer the bridge reads from
- [Steward Runbook](/vant/operations/steward-runbook) - the group pattern in operation
