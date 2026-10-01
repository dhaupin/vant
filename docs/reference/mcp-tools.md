---
version: 0.8.6
permalink: /reference/mcp-tools
layout: default
title: MCP Tools Reference
nav_order: 113
---

# MCP Tools Reference

Reference for the core MCP tools. The live registry is larger and grows
automatically (core libs are auto-wired): a running server exposes the
full, current list via `tools/list` or `curl http://localhost:3457/tools`.

Cross-org surfaces have their own sections below: [Agora and Mesh
Tools](#agora-and-mesh-tools-9) (remote votes, ledger sync, consensus),
[Market and Msg Tools](#market-and-msg-tools-8), and [Escrow
Tools](#escrow-tools-5) (budgets, holds, ledger status). Escrow
semantics in depth: [Escrow API](/reference/escrow). Task-first usage:
[Federation Playbooks](/vant/operations/federation-playbooks).

## Core Tools (9)

### vant_get_memory

Read from brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| category | string | Brain category |
| filename | string | File name |

**Example:**
```bash
vant_get_memory(category="learnings", filename="python")
```

---

### vant_set_memory

Write to brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| category | string | Brain category |
| filename | string | File name |
| content | string | Content to write |

**Example:**
```bash
vant_set_memory(category="lessons", filename="new", content="# New")
```

---

### vant_list_branches

List brain branches.

**Params:** None

**Example:**
```bash
vant_list_branches
```

---

### vant_create_branch

Create branch.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Branch name |

**Example:**
```bash
vant_create_branch(name="agent-1")
```

---

### vant_switch_branch

Switch branch.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Branch name |

**Example:**
```bash
vant_switch_branch(name="agent-1")
```

---

### vant_commit

Commit changes.

**Params:**
| Param | Type | What |
|-------|------|------|
| message | string | Commit message |

**Example:**
```bash
vant_commit(message="Updated learnings")
```

---

### vant_sync

Sync with GitHub.

**Params:**
| Param | Type | What |
|-------|------|------|
| direction | string | "push" or "pull" |

**Example:**
```bash
vant_sync(direction="push")
```

---

### vant_lock

Acquire/release brain lock.

**Params:**
| Param | Type | What |
|-------|------|------|
| action | string | "acquire" or "release" |

**Example:**
```bash
vant_lock(action="acquire")
```

---

### vant_health

System health check.

**Params:** None

**Example:**
```bash
vant_health
```

---

## Extended Tools (12)

### vant_get_islands

List islands.

**Params:** None

**Example:**
```bash
vant_get_islands
```

---

### vant_load_island

Load island.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Island name |

**Example:**
```bash
vant_load_island(name="github")
```

---

### vant_resolution_track

Track decision.

**Params:**
| Param | Type | What |
|-------|------|------|
| decision | string | Decision text |
| reason | string | Reasoning |

**Example:**
```bash
vant_resolution_track(decision="Use uv", reason="Faster than pip")
```

---

### vant_stego_encode

Encode PNG steganography.

**Params:**
| Param | Type | What |
|-------|------|------|
| message | string | Secret message |
| input | string | Input PNG path |
| output | string | Output PNG path |

**Example:**
```bash
vant_stego_encode(message="secret", input="in.png", output="out.png")
```

---

### vant_stego_decode

Decode PNG steganography.

**Params:**
| Param | Type | What |
|-------|------|------|
| input | string | PNG path |

**Example:**
```bash
vant_stego_decode(input="out.png")
```

---

### vant_config_get

Get config.

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | Config key |

**Example:**
```bash
vant_config_get(key="vant.repo")
```

---

### vant_config_set

Set config.

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | Config key |
| value | string | Config value |

**Example:**
```bash
vant_config_set(key="agent.name", value="MyAgent")
```

---

### vant_audit_log

Log audit entry.

**Params:**
| Param | Type | What |
|-------|------|------|
| type | string | Event type |
| data | string | Event data |

**Example:**
```bash
vant_audit_log(type="learn", data="New learning")
```

---

### vant_audit_list

List audit log.

**Params:**
| Param | Type | What |
|-------|------|------|
| limit | number | Max entries |

**Example:**
```bash
vant_audit_list(limit=10)
```

---

### vant_succession_info

Trust configuration.

**Params:** None

**Example:**
```bash
vant_succession_info
```

---

### vant_search

Search brain.

**Params:**
| Param | Type | What |
|-------|------|------|
| query | string | Search query |

**Example:**
```bash
vant_search(query="python")
```

---

### vant_rerank

RAG rerank + compress.

**Params:**
| Param | Type | What |
|-------|------|------|
| query | string | Search query |
| topK | number | Results count |

**Example:**
```bash
vant_rerank(query="authentication", topK=5)
```

---

## Agora and Mesh Tools (9)

The cross-org decision surface: remote voting and ledger sync over the
signed crew-bus. Every gate stays owner-side; these tools carry ballots
and ledgers, never authority. Requires a configured bus (the node's
name, port, secret, and agentId) with agora-sync installed.

### agora_vote

Cast a ballot on a PEER node's consensus topic. The topic owner runs
its full local gate stack (scope, registry vetting, quarantine,
one-vote) and acks the verdict.

**Params:**
| Param | Type | What |
|-------|------|------|
| node | string | Peer node name (registered crew-bus peer) |
| topic | string | Consensus topic on the peer |
| outcome | string | The ballot choice |
| agentId | string | Optional: vote as another pre-registered principal |

**Example:**
```bash
agora_vote(node="acme-node", topic="q3-platform-call", outcome="thursday-1400utc")
```

### agora_pull

Pull a topic's ledger from a peer and merge it LOCALLY. The merge
re-derives status, so the wire can never declare a topic passed.

**Example:**
```bash
agora_pull(node="acme-node", topic="forum-q3-platform-call-abc123")
```

### agora_push

Push a local topic's ledger to a peer (the return leg after voting on
a synced topic).

### agora_nodes

List this node's crew-bus peers and its own identity.

### agora_sync_status

Sync surface status: which buses have the dispatchers installed, node
identity, pending round-trips.

### consensus_create

Create a consensus vote topic (scope-aware; malformed scope is
rejected fail-closed).

**Params:**
| Param | Type | What |
|-------|------|------|
| topic | string | Charset [a-zA-Z0-9_-], 1-100 chars |
| options | string[] | At least two choices |
| minQuorum | number | Optional quorum |
| scope | object | Optional: `{ owner: "team:id", visibility: "scope" }` |

### consensus_vote

Cast a vote on a consensus topic (one vote per agent; scoped topics
reject non-members).

### consensus_tally

Tally a topic: winner, percentages, quorum status.

### consensus_get

Get a topic's ledger. Scope-aware: pass `viewerId` (a member principal)
to read a scoped topic; without it, scoped topics return null, same
shape as not-found.

### consensus_list

List topics with status and vote counts. Pass `viewerId` to include
scoped topics you are a member of; the anonymous view omits them
entirely.

## Market and Msg Tools (8)

### market_list

List knowledge for trade.

**Params:**
| Param | Type | What |
|-------|------|------|
| type | string | knowledge, insight, memory, or favor |
| title | string | Listing title |
| price | string | Optional price |
| context | object | Optional; carries consentGiven |

### market_bid

Bid on knowledge.

### market_trade

Execute a trade (`listingId`, `buyerId`).

### market_search

Search listings by type, tags, or query.

### market_stats

Market statistics.

### market_get

Fetch one listing. Scope-aware: a scoped listing is visible to its
member set (pass the viewer context).

### msg_send

Send a message to a channel (`channel`, `content`, optional `from`).

### msg_list

List messages in a channel (`channel`, optional `limit`).

## Return Types

## Escrow Tools (5)

Escrow is the accountability layer: budgets, holds, and the ledger
behind them. These tools were undocumented before pass 77 - and three
of them were broken (see the [Escrow API export note](/reference/escrow)).

### escrow_create

Create an escrow budget for an agent or org.

**Params:**
| Param | Type | What |
|-------|------|------|
| org | string | Agent or org id that owns the budget |
| budget | number | Optional; budget limit (default 1000) |

Returns `{ ok: true, org, budget: { spent, limit, available } }`.

### escrow_canSpend

Check whether an agent can afford an amount.

Returns `{ allowed, reason, layer, available }`.

### escrow_hold

Place a hold: a reservation with a timeout (default 5 minutes). **A
hold does not debit budget** - it records a condition entry.

**Params:**
| Param | Type | What |
|-------|------|------|
| holdId | string | Unique hold id |
| condition | object | Optional condition payload (amount, agent, type, ...) |

Returns `{ held: true, holdId }`. Holds persist to the escrow store.

### escrow_release

Release a hold by id. Returns `{ released: boolean }`.

### escrow_status

Read the escrow ledger. No params: budgets, holds, approvals, quotas
counts. With `org`: that agent's budget plus the holds map.

## Return Types

| Tool | Returns |
|------|---------|
| vant_get_memory | { content, ... } |
| vant_set_memory | { success } |
| vant_list_branches | [branch1, branch2] |
| vant_create_branch | { success, name } |
| vant_switch_branch | { success } |
| vant_commit | { success, hash } |
| vant_sync | { success } |
| vant_lock | { token } |
| vant_health | { status, version } |
| brain_migration_status | { markerVersion, targetVersion, upToDate, legacy, guidance } |

---

### brain_migration_status

Check brain layout version + pending migrations. Reports `legacy: true`
with actionable guidance when a pre-multi-brain (old single-brain)
layout is detected, `vant start` auto-imports it; this tool lets MCP
clients surface the same status.

**Params:** None

**Example:**
```text
brain_migration_status()
```

**Returns (legacy tree):**
```json
{
  "markerVersion": null,
  "targetVersion": 3,
  "upToDate": false,
  "legacy": true,
  "guidance": "Run `vant migrate` (name it: vant migrate --brain-name <name>; default: vant)."
}
```

---
