---
version: 0.8.6
permalink: /multi-agent/federation
layout: default
title: Federation
nav_order: 51
description: The Agora at scale - sovereign Vant nodes forming a mesh, sharing decisions without sharing books.
---

# Federation

> One Vant install is sovereign: its state, its gates, its books. A
> **mesh** is several sovereign installs meeting over a signed wire -
> each keeps its own brain, its own org model, and its own money, while
> decisions, work, and announcements cross org boundaries safely.

## On this page

- [The layering](#the-layering)
- [The six moving parts](#the-six-moving-parts)
- [The authority rules](#the-authority-rules)
- [Where to go next](#where-to-go-next)

## The layering

```text
org (one install: brain, crews, org model, gates)
  -> crew (agents inside one install)
    -> mesh (sovereign installs over the signed wire)
       -> group (a mesh with a dedicated steward install)
```

A crew lives inside one install. A mesh is what you get when two or
more installs register each other and start exchanging signed
envelopes. A group adds a **steward**: a small, dedicated install that
hosts the shared org model and the group's agora topics, running no
production work (see the [Steward Runbook](/vant/operations/steward-runbook)).

Every mesh node has four things, all local by construction:

| Always local | Why |
|--------------|-----|
| State (ledgers, claims, brains) | The sovereignty line: books never move |
| Gates (scope, sandbox, registry) | A vote is decided where the trust anchors live |
| Org model (teams, assignments) | Each org describes itself; a group model is a separate replica |
| Budgets | Money debits where the budget lives |

## The six moving parts

| Part | What it does | Interface |
|------|--------------|-----------|
| Genesis and the ring rite | Two nodes form a pair; the ring admits members without re-keying | `vant genesis`, [CLI](/vant/reference/cli) |
| agora-sync | Remote votes and ledger sync over the signed bus | [Agora](/vant/operations/agora): `agora_vote`, `agora_pull` |
| org-sync | The steward's org model, replicated as a resolution cache | Steward calls `orgSync.replicate(bus, node)` after each model change; members read locally |
| Settlement | Cross-node payment: buyer debits its own escrow, the other side records a claim | [Settlement](/vant/operations/settlement) |
| Notices | The board: plain announcements with durable catch-up | [Notices](/vant/operations/notices) |
| Mesh status | What is everyone working on, one command, federated view | `vant mesh status --peers` |

## The authority rules

Four rules make the mesh safe to reason about, and each one is pinned
by tests:

1. **Scope resolves where the model lives.** A scoped topic is decided
   on the node whose org model the scope points into. Members vote
   remotely; the owner's gates run unchanged.
2. **The wire never declares truth.** Synced ledgers merge adopt-only;
   status is re-derived locally. A peer cannot declare a topic passed.
3. **Membership facts travel, scope content does not.** Scoped
   decisions stay in the agora; the board carries only plain outcome
   notices. The bridge refuses scoped topics by design.
4. **Money is recorded, not held.** A cross-node payment debits the
   buyer's escrow locally; the other side records a claim. No shared
   bank.

## Where to go next

- Join a running mesh: [Join a Mesh playbook](/vant/operations/federation-playbooks)
- Run the group pattern as an operator: [Steward Runbook](/vant/operations/steward-runbook)
- CLI surface: [CLI Reference](/vant/reference/cli), section "Federation"
- Crew coordination inside one install: [Coordination](/vant/multi-agent/coordination)
