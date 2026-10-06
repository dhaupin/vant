---
version: 0.8.6
permalink: /operations/agora
layout: default
title: Agora
nav_order: 68
description: Cross-node agora operations - remote votes, ledger sync, and scoped reads over the signed crew-bus.
---

# Agora

> The agora is where decisions live: consensus topics, scoped ledgers,
> and the legs that carry ballots between sovereign nodes. The
> `vant agora` CLI is the participant's window into all of it.

## On this page

- [What the agora is](#what-the-agora-is)
- [CLI reference](#cli-reference)
- [MCP equivalents](#mcp-equivalents)
- [Scoped reads](#scoped-reads)
- [The trust model](#the-trust-model)

## What the agora is

Two layers share the name, and they connect:

- **The decision layer** (lib/consensus, lib/forum): topics, ballots,
  tallies, deadlines. Topics are created on the node whose org model
  their scope points into.
- **The sync layer** (lib/agora-sync): the wire legs that carry ballots
  and ledgers between nodes over the signed crew-bus, plus ledger
  hygiene (the reaper) and gossip.

`vant agora` operates the sync layer. Your node votes on a PEER's
topic; the owner's gate stack decides. You pull a peer's ledger to
read it locally; the merge re-derives status, so the wire can never
declare a topic passed.

## CLI reference

| Command | What it does |
|---------|--------------|
| `vant agora nodes` | List bus peers + this node's identity |
| `vant agora status` | Sync surface status: buses installed, pending round-trips |
| `vant agora vote <node> <topic> <outcome>` | Vote on a peer's topic |
| `vant agora pull <node> <topic>` | Pull + merge a peer's ledger |
| `vant agora push <node> <topic>` | Push a local ledger to a peer |

Common options: `--agent <id>` votes as a specific pre-registered
principal; `--timeout <ms>` bounds the round-trip.

```bash
# Who can I reach, and who am I on the wire?
vant agora nodes

# Cast a ballot on acme's topic (their gates verify it)
vant agora vote acme-node q3-platform-call thursday-1400utc

# Bring the finished ledger home so local scope checks can read it
vant agora pull acme-node forum-q3-platform-call-abc123

# Share YOUR topic's ledger with a peer (they re-derive, never trust)
vant agora push beta-node my-local-topic
```

## MCP equivalents

The same legs as tools, for agent-driven flows (full schemas in the
[MCP Tools Reference](/vant/reference/mcp-tools)):

| Tool | Matches |
|------|---------|
| `agora_vote` | `vant agora vote` |
| `agora_pull` | `vant agora pull` |
| `agora_push` | `vant agora push` |
| `agora_nodes` | `vant agora nodes` |
| `agora_sync_status` | `vant agora status` |

Task-shaped examples: [Federation Playbooks](/vant/operations/federation-playbooks).

## Scoped reads

A scoped topic's ledger is only readable by its member set. Two ways
that check runs:

- **On the owner:** `consensus_get(topic, viewerId)` admits members,
  returns null for everyone else (same shape as not-found: an
  outsider cannot even distinguish exists from missing).
- **On your node after a pull:** the group's org model arrives as a
  replica (org-sync), so your local scope check admits group members
  without a round-trip. Non-members stay denied, fail-closed.

```js
const consensus = require('./lib/consensus');
const ledger = consensus.get('forum-q3-platform-call-abc123', 'beta-1');
// member: full ledger | non-member: null
```

## The trust model

Everything `vant agora` does rides the signed crew-bus (HMAC envelopes
against your registered peers). On top of the transport:

- Registered peers only: an unknown origin gets no ballot door
- Sender binding: replies resolve only the request they were sent for
- Owner-side gates: scope, registry vetting, quarantine, one-vote, and
  deadline all run where the topic lives
- Merge-only adoption: local votes are never overwritten; status is
  re-derived locally

## Related

- [Federation](/vant/multi-agent/federation) - the concept layer: mesh, groups, stewards
- [Federation Playbooks](/vant/operations/federation-playbooks) - task recipes using these verbs
- [Webhooks](/vant/operations/webhooks) - the transport the legs ride
- [CLI Reference](/vant/reference/cli) - federation verbs at a glance
