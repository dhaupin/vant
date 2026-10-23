---
version: 0.8.6
permalink: /reference/consensus
layout: default
title: Consensus API
description: The consensus API - create proposals, cast votes, tally outcomes, and fetch results across a mesh.
nav_order: 123
---

# Consensus API

Agent voting system - NOT crypto, just decision making.

## Functions

Topics are identified by a topic name (e.g. `forum-q3-call-abc123`):

| Function | Signature | What |
|----------|-----------|------|
| `create(topic, options)` | sync, lock-protected | Create a topic ledger |
| `createSecured(topic, options, userCtx)` | async | Pipeline-gated create |
| `vote(topic, outcome, agentId, options)` | sync | Cast a vote |
| `voteSecured(topic, outcome, agentId, options, userCtx)` | async | Pipeline-gated vote |
| `tally(topic)` | sync | Re-derive status + counts |
| `get(topic, viewerId?)` | sync | Read the ledger - scoped topics admit members only (pass null for non-members, same as not-found) |
| `list()` | sync | All ledgers |
| `resolve(topic)` | sync | Mark resolved |
| `getStats()` | sync | Voting stats |
| `hasVoted(topic, agentId)` / `verify(...)` / `checksum(topic)` | integrity |
| `peerVerify(...)` | cross-node vote verification |
| `on(event, cb)` / `emit(event, data)` | listener seam for connect events |
| `exportTopic(topic)` / `mergeTopic(topic, data)` / `reapSynced()` | agora-sync seams |

## Topic States

| State | Meaning |
|-------|---------|
| `open` | Accepting votes (deadline-gated) |
| `passed` / `failed` | Re-derived locally by tally - never trusted from the wire |
| `resolved` | Decision recorded |

## Usage

```javascript
const consensus = require('./lib/consensus');

// Create a topic
const ledger = consensus.create('q3-call', {
    ballot: ['yes', 'no', 'abstain'],
    minQuorum: 3
});

// Vote
consensus.vote('q3-call', 'yes', 'agent-1');

// Tally (re-derives status locally)
const result = consensus.tally('q3-call');
```

## Events

| Event | When |
|-------|------|
| `vote:cast` | New vote |
| `proposal:created` | Proposal created |
| `proposal:resolved` | Resolved |

---

## Related

- [Federation](/vant/multi-agent/federation) - how multi-vant consensus extends
- [Agora](/vant/operations/agora) - the local vote layer consensus rides on
- [Resolution](/vant/reference/resolution) - the dispute-resolution module consensus feeds