---
version: 0.8.6
permalink: /operations/federation-playbooks
layout: default
title: Federation Playbooks
nav_order: 67
description: Task-oriented playbooks for mesh participants - join, vote, sync, settle, catch up, observe.
---

# Federation Playbooks

> Task-first recipes for working inside a mesh. Concepts and the
> security model: [Federation](/vant/multi-agent/federation). Operator
> setup of a group's steward: [Steward Runbook](/vant/operations/steward-runbook).

## On this page

- [Join a mesh](#join-a-mesh)
- [Vote on another org's decision](#vote-on-another-orgs-decision)
- [Propose a cross-org decision](#propose-a-cross-org-decision)
- [Read a scoped group topic locally](#read-a-scoped-group-topic-locally)
- [Publish and settle cross-node work](#publish-and-settle-cross-node-work)
- [Catch up after downtime](#catch-up-after-downtime)
- [Observe the mesh](#observe-the-mesh)

## Join a mesh

You need three things from the mesh operator, out-of-band: the host
node's name and port, and a one-time secret. Never send the secret over
the same wire you are joining.

### Pair join (first contact)

```bash
# Their side hosts:
vant genesis create --name acme-node --agent acme-1 --port 4890 --joiner beta-node --joiner-agent beta-1
# Your side joins (the ack is the live proof both sides hold the key):
vant genesis join --name beta-node --agent beta-1 --port 4891 --host acme-node --host-port 4890 --secret <pair-secret>
```

### Ring admission (every member after the first)

The ring admits new members WITHOUT re-keying existing pairs. On the
steward:

```bash
vant genesis admit  # via lib: genesis.admit({ member: { name: 'theta-node', agentId: 'theta-1', port: 4893 } })
```

On the joining member:

```js
const genesis = require('./lib/genesis');
await genesis.accept({ host: 'group-steward', hostPort: 4890, secret: ringSecret, name: 'theta-node', agentId: 'theta-1', port: 4893 });
```

Verify from anywhere in the mesh:

```bash
vant genesis status   # non-secret topology + secret source
vant agora nodes      # your bus peers + your node identity
```

## Vote on another org's decision

The topic owner runs its own gates; you just vote. Over MCP:

```js
agora_vote(node="acme-node", topic="q3-platform-call", outcome="thursday-1400utc")
// optionally vote as a pre-registered principal:
agora_vote(node="acme-node", topic="q3-platform-call", outcome="thursday-1400utc", agentId="beta-1")
```

Or from the shell:

```bash
vant agora vote acme-node q3-platform-call thursday-1400utc
```

The ack carries the verdict (accepted, or the reason: non-member,
quorum, deadline, duplicate). Your node never needs the owner's org
model to vote.

## Propose a cross-org decision

Scoped topics live on the node whose org model the scope points into
(pass-50). Create it THERE, then announce the topic id to members by
any channel you like:

```js
forum_vote(
  proposal="Pick the Q3 platform call slot",
  options=["thursday-1400utc", "friday-0900utc"],
  minQuorum=3,
  scope={ owner: "team:team_group1", visibility: "scope" }
)
// returns a topic id like forum-q3-platform-call-abc123
```

Tally and fetch:

```js
consensus_tally(topic="forum-q3-platform-call-abc123")
consensus_get(topic="forum-q3-platform-call-abc123", viewerId="acme-1")  // scoped: pass YOUR principal
```

Members pull the result into their own node:

```js
agora_pull(node="acme-node", topic="forum-q3-platform-call-abc123")
```

The merge re-derives status locally; the wire can never declare a topic
passed.

## Read a scoped group topic locally

Members of a group hold a replica of the steward's org model, so scope
checks resolve on your own node. Nothing to do after the steward pushes:
`consensus_get` with your `viewerId` admits you if the steward's model
says you are a member, and denies you otherwise, fail-closed.

Check what your node holds:

```js
// replica generation + entity counts (read-only view)
require('./lib/org-sync').replicaStatus()
```

## Publish and settle cross-node work

List on the node whose gates hold the scope (the steward for group
work), then settle: the buyer's escrow debits on the buyer's own node
and the other side records a claim.

```js
// seller side (steward holds the group scope):
market_list(type="knowledge", title="Minutes pack", price="6", context={ consentGiven: true })

// buyer side:
settlement.makeInvoice({ listingId, price: 6, buyer: 'beta-1', seller: 'acme-1' })
settlement.sendInvoice(crewBus, 'acme-node', invoice)
```

The claims ledger is the proof of settlement; budgets never leave the
node that owns them.

## Catch up after downtime

Pull a specific topic from a peer:

```bash
vant agora pull acme-node forum-q3-platform-call-abc123
```

Or ask a peer for its whole shareable board:

```bash
vant notices pull --all        # every registered peer
vant notices pull acme-node    # one peer
vant notices list              # read the board
```

Board notes carry a TTL (0 means sticky) and the board is capped, so a
long-absent node converges to the same view as everyone else on the
next pull.

## Observe the mesh

```bash
vant mesh status               # your node: peers, topics, budgets, channels, settlements
vant mesh status --peers       # federated: each peer's shareable report, degraded per-peer
vant mesh status --peers --json
vant agora status              # sync surface: buses installed, pending round-trips
```

The federated view shows only what each peer's scope filter admits:
aggregates and public names, never scoped content.

## Related

- [Federation](/vant/multi-agent/federation) - concepts and the authority rules
- [Steward Runbook](/vant/operations/steward-runbook) - operator setup of a group's steward install
- [CLI Reference](/vant/reference/cli) - every verb used above
