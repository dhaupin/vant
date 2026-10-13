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
Tools](#agora-and-mesh-tools-11) (remote votes, ledger sync, consensus),
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

Acquire, release, or inspect the brain authorization lease. Full API:
[Locks API](/vant/reference/locks).

**Params:**
| Param | Type | What |
|-------|------|------|
| action | string | "acquire", "release", "status", "stack", "force", or "stats" |
| token | string | Release token from acquire |
| agentId | string | Agent identifier |

`action="stats"` (pass 117) returns lock observability counters for this
process: `mutex` (acquires, held, unavailable, takeovers, releases,
bodiesRun, bodyErrors, aborted, holdMsTotal, holdMsMax, heldNow) plus
`lease` (granted, refreshed, denied, released, releaseDenied, forced). Read
deltas between polls: there is no reset API, so a counter can never lie
about the past.

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

## Full Catalog (the rest of the registry)

Everything after this point is grouped by domain. Params listed are the
**required[] first, then optional properties** - copied from each tool's
`inputSchema` exactly as registered (`curl http://<host>:3457/tools` is
the live source of truth for your install).

> Registry facts (audited pass 190, recount pass 210, recount pass 211 -
> guests #185, recount pass 212 - work_assign): ~300 hand-registered
> tools across 67 domain prefixes (328 total `mcp.listTools()` entries
> incl. generated/wrapper tools - the H1 guest layer added guest_issue/
> guest_list/guest_revoke, pass 212 added the composed `work_assign`),
> plus the `vant_call` umbrella. Every tool's handler
> routes through a real lib call - the canned handlers found by audits
> (configs pass 95/96, this pass) were rerouted. Two tools report honest
> not-applicable instead of pretending: `stream_watch`, `qos_withTimeout`.

### Agents (Vant-to-Vant spawns)

```bash
vant_agent_kill(id="x")                # terminate a spawned agent
vant_agent_list()                       # active agents
vant_agent_proto_list()                 # agent templates
vant_agent_proto_load(name="x")
vant_agent_spawn(name="A", role="Asst") # runtime spawn (agents.maxAgents quota)
```

### Work orders (pass 212, #185 H4)

`work_assign` is the composed verb: one call hands off work end-to-end.

```bash
vant_work_assign(task="sweep the map", name="Scout", budget=5)
# -> { ok:true, workId, agentId, delegated:true, eraFolded:true, hold:{...} }

vant_work_assign(task="grow the map", agentId="agent_...")  # reuse an existing agent
# explicit agentId is honored exactly - never silently replaced by a spawn
```

Refusal law: every failed leg answers a typed honest refusal and fires
BEFORE side effects. `E_BUDGET_REFUSED` leaves no orphan agent
(budget gates precede spawn); a refused delegation releases the escrow
hold, so nothing strands reserved budget. The era fold records the work
under `task:` -> threads (the era catalogue) only when an era is OPEN
(the era subscriber's no-op contract); `eraFolded:false` says so.

### Brain family (46 tools - cor member-related core)

Reading and writing the brain, multibrain stack hops, geometry memory,
brain evolution and link/graph side: every brain_* tool is a thin call
into `lib/brain.js`.

```bash
# Read/write one brain file
brain_read(name="learnings/python")
brain_write(name="learnings/python", content="# new text", format="md")
brain_save(name="learnings/python", content="# text")   # save variant
brain_remove(name="learnings/old")

# The corpus and the multibrain stack
brain_corpus()
brain_list(); brain_state(); brain_stack(wait=true)
brain_push(name="axolotl", type="private")   # hop the stack
brain_pop(); brain_switch(name="vant")

# Files
brain_list_files(); brain_get_file(name="x"); brain_delete_file(name="x")

# Geometry-coded memory (NSC9 addresses)
brain_geo_store(key="k", data=<json>); brain_geo_load(barcode="bc"); brain_geo_list()

# Attends/links (agent graph)
brain_attend(name="aria", score=5); brain_link(from="a", to="b", type="relates")
brain_synapses(); brain_connections(brain="vant", depth=2); brain_discover(query="rust")
brain_migration_status()   # layout version + legacy import guidance
```

### Vant-brain dropbox/my-stuff family

```bash
vant_brain_get_file(name="x"); vant_brain_drop_file(name="x", content="...")
vant_brain_list_files(); vant_brain_delete_file(name="x"); vant_brain_clear_dropbox()
vant_brain_my_list(); vant_brain_my_get(name="x"); vant_brain_my_drop(name="x", content="...")
vant_brain_my_stuff(); vant_brain_update_my_stuff(key="k", content="...")
vant_brain_your_stuff()
vant_brain_backup(path="backups/x.tar.gz"); vant_brain_backups(); vant_brain_restore(path=...)
vant_brain_clear(); vant_brain_stash(data=...); vant_brain_handlers(); vant_brain_clear_handlers()
```

### Boot (layered boot)

```bash
vant_boot_status()          # layer status
vant_boot_layers()          # available layers
vant_boot_init(taskId="t", scopes=["read"])
vant_boot_reset()
```

### Branches

```bash
vant_list_branches(); vant_create_branch(name="feature-1"); vant_switch_branch(name="main")
brain_push(name="feature-1"); brain_pop()
vant_branch_auto(prefix="agent/"); vant_branch_is_dirty(); vant_branch_changed_brains()
```

### Citations (git-backed grounding)

```bash
vant_citations_add(commit="abc1234", context="why the claim is trusted")
vant_citations_list()      # {count, sources} - the ledger's real rows
vant_citations_format(commit="abc1234")    # {cited, citation} - miss reports cited:false
```

### Compute (multi-language eval)

```bash
compute_eval(code="2+2", language="node"); compute_invoke(fn="julia.eval", args=[...]); compute_list(); compute_status()
vant_compute_eval(code="println(2+2)", lang="julia")
```

### Config (real persistence, pass 95 fixed)

```bash
vant_config_get(key="mcp.requireKey")    # flags -> current-brain config -> global
vant_config_set(key="mcp.requireKey", value="false")    # persists to the CURRENT brain
```

### Connector

```bash
vant_connector_list()          # getConnector factory surface: pinecone|qdrant|weaviate
vant_connector_connect(service="qdrant")   # real async connect()
```

### Context (prompt cache engine)

```bash
context_build(brain="vant"); context_refresh(); context_layers()
context_inspect(); context_cache(model="claude-3"); context_heartbeat(action="start")
```

### Cron

```bash
cron_schedule(id="nightly", interval=3600000)   # ms interval: 1s..1d
cron_list(); cron_run(id="nightly"); cron_cancel(id="nightly")
```

### Embeddings

```bash
vant_embed(text="The thing I want vectors for")
vant_embed_similarity(textA="a", textB="b")    # cosine similarity
```

### Escrow - see the [dedicated section](#escrow-tools-5) below.

### Events (the shared bus)

```bash
vant_help(query="events")      # discover
# the event_tail family: see event_tail/_sink_enable/_sink_stats in the table below
```

| Tool | Params |
|------|--------|
| event_tail | max, nameFilter, module (all optional) |
| event_sink_enable | - |
| event_sink_stats | - |

### Forum and Consensus - see the [Agora section](#agora-and-mesh-tools-11).

### Geometry

```bash
vant_geometry_init()
vant_geometry_remember(category="lessons", key="rust", content="...")
vant_geometry_recall(brainPath="lessons/rust"); vant_geometry_knows(key="rust")
```

### Habitat - see the [dedicated section](#habitat-tools-14) below.

### Lineage

```bash
lineage_record(event="code", data={...}, parent=...)
lineage_trace(id="x", depth=5); lineage_stats()
```

### Lock

```bash
vant_lock(action="acquire"); vant_lock(action="release", token=...)
```

Returns `{action, acquired, token}` / `{action, status, stack, held}` /
`{action, forceReleased}` - the action decides.

### Market and Msg - see the [Market and Msg section](#market-and-msg-tools-8).

### Memory (state + learn docs)

```bash
vant_memory_state(key="k", value="v", ttl=3600)
vant_memory_recall(key="k"); vant_memory_learn(key="k", content="doc text")
vant_memory_query(key="k"); vant_memory_clear()
vant_memory_stats(); vant_memory_address(data="..."); vant_memory_locate(barcode="bc")
```

### Network (fetch/whitelist layer)

```bash
vant_network_fetch(url="https://api.github.com"); vant_network_fetchJson(url=...)
vant_network_online()      # {online: bool}
```

### QoS - in the table below

### Recursion

```bash
recursion_lookup(operation=..., start=...); recursion_traverse(operation=..., root=...)
recursion_batch(operation=..., items=[...]); recursion_retry(operation=...)
```

### Remote (provider registry)

```bash
vant_remote_listProviders(); vant_remote_addProvider(type="git", config=...)
vant_remote_removeProvider(id="p"); vant_remote_call(host="acme", tool="brain_read", args=...)
```

### Resolution - see the table section above ([Track decision](#vant_resolution_track)).

### Sandbox / Sudo / Trust / Teams / Storage / Tmp / Stream / Search / Optimization

Complete tool/param lists in [the tables below](#domains-a--z-tables).

---


---

### vant_load_island

Load island. Islands with a habitat boundary policy (`_island:<name>`)
are RLS-gated at load (see [RLS island boundaries](/reference/rls)):
optional `userCtx` / `options` carry the caller's context; the current
agent's habitat identity is used otherwise. Row-level filter/mask
applies to island data.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Island name |
| options.userCtx | object | Optional RLS context (else current agent / anonymous) |
| options.brain | string | Optional brain override for corpus islands |

**Example:**
```bash
vant_load_island(name="github")
```

---

### islands_canAccess

RLS decision for an island: resolves the same context chain as the
enforcement gates (explicit `userCtx` -> current agent's habitat
identity -> anonymous) against the island's boundary policy. Policy-less
islands report `gated: false` and `allowed: true`.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Island name |
| userCtx | object | Optional RLS context |
| mode | string | `read` (default) or `write` |

Returns `{ name, mode, allowed, gated, resolved }`.

---

### vant_resolution_track

Record a decision delta in the resolution ledger (persisted - rides
`lib/resolution.logDelta`, survives restarts).

**Params:**
| Param | Type | What |
|-------|------|------|
| file | string | Brain file the decision concerns |
| change | string | The decision/change text |
| changed_by | string | Optional attribution |
| branch | string | Optional branch (default: main) |

**Example:**
```bash
vant_resolution_track(file="lessons.md", change="Use uv over pip for installs")
```

Read history back with `vant_resolution_list(file="lessons.md")`.

---

### vant_universe_snapshot

Derive a world's Genesis snapshot (Wave U1, `labs/prd-universe.md`): a
PASS-derived identity from the universe constant - SeedChain seed, five
generation cells (root + ring 1), and a canonical-encoder fingerprint.
No state is written; the same (name, universe) always yields a
byte-identical snapshot. Failures return typed
`{ ok:false, code: 'E_SNAPSHOT_NAME' | 'E_SNAPSHOT_UNIVERSE' }`.

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | World name (spine `/world/` grammar, required) |
| universe | string | Universe constant override (optional; env/default per seeds.js) |

**Example:**
```bash
vant_universe_snapshot(name="my-world")
```

Fork with `vant_universe_fork(parent="my-world", child="sub")` - the
child derives via SeedChain prefix folding, so `parent.child` never
collapses onto a direct `child` derivation. Universe source reported by
`vant_universe_status()` (`explicit` / `VANT_UNIVERSE_SEED env` /
`default`). CLI equivalents: `vant universe snapshot|fork|status`.

---

### vant_universe_fork

Fork a world: the child's name is `<parent>.<child>` and its seed folds
through the parent's SeedChain seed (leak-containment: identical path
string, different bytes).

**Params:**
| Param | Type | What |
|-------|------|------|
| parent | string | Parent world name (required) |
| child | string | Child segment (one path segment, required) |
| universe | string | Universe constant override (optional) |

**Example:**
```bash
vant_universe_fork(parent="my-world", child="scenario-a")
```

---

### vant_universe_status

Report which universe constant source is active
(`explicit` / `VANT_UNIVERSE_SEED env` / `default`) plus the
default-world (`vant`) fingerprint for the resolved constant.

**Params:**
| Param | Type | What |
|-------|------|------|
| universe | string | Universe constant override (optional) |

**Example:**
```bash
vant_universe_status()
```

---

### vant_universe_record

Record a STORED, content-addressed scenario manifest (Wave U2,
`labs/prd-universe.md`): freezes the world's snapshot (seed, five
generation cells) plus a state root into a manifest whose id IS the
hash of its payload - the same (world, universe, state root) recorded
from two fresh processes yields a byte-identical manifest and id, and
a re-record of identical input is a dedup no-op (`added: false`).
Persisted through the brain-scoped arch-A state store
(`state/universe-manifests.json`, WAL included). Forked worlds use the
dotted name with `fork: true` (see `vant_universe_fork`).

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | World name; for a fork the full dotted name `parent.child` (required) |
| universe | string | Universe constant override (optional) |
| fork | boolean | Derive via SeedChain prefix folding (optional) |
| stateRoot | string | Explicit protocol-state root hash to freeze (optional; default = the derived genesis fingerprint) |

**Example:**
```bash
vant_universe_record(name="my-world", stateRoot="<current 64-hex root>")
```
Typed refusals: `E_SNAPSHOT_NAME` / `E_SNAPSHOT_UNIVERSE` /
`E_SNAPSHOT_MANIFEST` (invalid registry override) / `E_STATE_WRITE`
(store deny). CLI: `vant universe record`.

---

### vant_universe_diff

Diff two stored manifests (U2.2): one structural comparison per genesis
cell plus the frozen state-root crosscheck. Identical manifests report
`identical: true` with zero changes. Contract-refused (typed, never
noisy) when the manifests come from DIFFERENT universe constants
(`E_SNAPSHOT_UNIVERSE` - the same-universe contract, carried by a
universe-canary identity tag at record time) or address DIFFERENT
worlds (`E_SNAPSHOT_WORLD_MISMATCH` - a rename, not a delta).

**Params:**
| Param | Type | What |
|-------|------|------|
| a | string | Manifest id (or unambiguous id prefix) of manifest A (required) |
| b | string | Manifest id (or unambiguous id prefix) of manifest B (required) |
| manifestFile | string | Registry state-file override (advanced) |

**Example:**
```bash
vant_universe_diff(a="09a4…", b="3c3f…")
```
Return shape: `{ ok, identical, same, universeMatch, a, b, changed[],
onlyInA[], onlyInB[], stateRootDiffers, summary }`.
CLI: `vant universe diff`.

---

### vant_universe_resume

Resume a stored scenario (U2.3): re-loads the manifest, optionally
crosschecks the frozen state root against a live probe
(`liveRootMatch`: `true` match / `false` drifted / `null` no probe),
and writes a restore marker. The marker goes through
`stateStore.persistMerged`, which takes the brain-root lock with
fail-closed semantics - while a peer holds the region the resume is
REFUSED (`{ ok:false, code:'E_STATE_LOCKED' }`), never degraded to an
unlocked write - and rides the arch-A WAL.

U2 shipped the lock-gated VERIFIED MARKER path; Wave U3 added the
escrow-backed byte-restoring executor (below).

**Params:**
| Param | Type | What |
|-------|------|------|
| id | string | Manifest id (or unambiguous prefix) (required) |
| actor | string | Resume actor recorded in the marker (optional; default `operator`) |
| manifestFile | string | Registry state-file override (advanced) |

**Example:**
```bash
vant_universe_resume(id="09a4…", actor="steward-agent")
```
Typed refusals: `E_SNAPSHOT_ABSENT` (unknown id),
`E_SNAPSHOT_AMBIGUOUS` (id prefix matches several), `E_STATE_LOCKED`
(fail-closed). CLI: `vant universe resume`.

U3 addition: pass `materialize: true` to run the escrow-backed
byte-restoring executor - recorded cell VALUES are restored through the
arch-A store, billed 1 credit per cell against
`scenario:materialize:<actor>`, and a broke actor is refused typed
(`E_SNAPSHOT_BUDGET`) before any write. See the
[Scenario Playbook](/operations/scenario-playbook).

---

### vant_scenario_crew

Governance playbook (Wave U3, `labs/prd-universe.md`): assemble a
scenario crew of N agents over ONE shared escrow budget pool. The pool
is real - later tasks draw from it through the live escrow workspace
gate. Ledger rides the arch-A state store
(`state/universe-scenarios.json`, WAL included).

**Params:**
| Param | Type | What |
|-------|------|------|
| name | string | Crew name (alnum + `._-`, ≤64) (required) |
| agents | number | Crew size 2-10 (default 3) |
| budget | number | Shared pool credits (default 120; ≥ crew size, ≤ 100000) |
| universe | string | Universe constant override (optional) |

**Example:**
```bash
vant_scenario_crew(name="audit-world", agents=3, budget=500)
```
Typed refusals: `E_SCENARIO_NAME` / `E_SCENARIO_CREW` /
`E_SCENARIO_BUDGET`, `E_SCENARIO_SPAWN` on roster failure. CLI:
`vant scenario crew`.

---

### vant_scenario_task

Governance playbook (Wave U3): delegate ONE task end-to-end under the
real gates - quarantine first (fail-closed, refusal recorded who/why,
BEFORE any budget draw), escrow hold against the shared pool, then a
CONSENSUS voted closeout (quorum ballot; no single-agent bless) logged
via `resolution.logDelta`.

**Params:**
| Param | Type | What |
|-------|------|------|
| crew | string | Crew name (must be assembled first) (required) |
| task | string | Task description (≤512 chars) (required) |
| cost | number | Budget cost (default: half the pool, pool-capped) |
| universe | string | Universe constant override (optional) |

**Example:**
```bash
vant_scenario_task(crew="audit-world", task="Verify the pinned ledger", cost=250)
```
Typed refusals: `E_SCENARIO_QUARANTINED` (every member quarantined -
escrow never touched), `E_SCENARIO_BUDGET` (empty pool),
`E_SCENARIO_DELEGATE`, `E_SCENARIO_NO_QUORUM` (no voted pass),
`E_SCENARIO_ABSENT` (crew not assembled), `E_SCENARIO_TASK` (hostile
text). CLI: `vant scenario task`.

---

### vant_scenario_status

Governance playbook (Wave U3): inspect an assembled scenario crew -
ledger row (phase, roster, workspace) plus the live escrow pool
headroom, null-safe when escrow is absent.

**Params:**
| Param | Type | What |
|-------|------|------|
| crew | string | Crew name (required) |
| universe | string | Universe constant override (optional) |

**Example:**
```bash
vant_scenario_status(crew="audit-world")
```
Typed refusals: `E_SCENARIO_ABSENT`, `E_SCENARIO_NAME`. CLI:
`vant scenario status`.

---

### vant_stego_encode

Encode a message into a PNG via the real stego engine (LSB wire).

**Params:**
| Param | Type | What |
|-------|------|------|
| image | string | Input PNG path |
| message | string | Secret message |
| output | string | Output PNG path |
| password | string | Optional encryption passphrase |

**Example:**
```bash
vant_stego_encode(image="in.png", message="secret", output="out.png")
```

Returns `{ encoded: true }` or `{ encoded: false, error }` on a blocked
path or missing image - errors are surfaced, never a silent bless.

---

### vant_stego_decode

Decode a hidden message from a PNG via the real stego engine.

**Params:**
| Param | Type | What |
|-------|------|------|
| image | string | PNG path |
| password | string | Optional (if encoded with one) |

**Example:**
```bash
vant_stego_decode(image="out.png")
```

---

### vant_citations_list / _add / _format

Citation grounding over the git-backed citation ledger
([Citations](/vant/memory/citations) for the brain-CLI view).

```bash
vant_citations_add(commit="abc1234", context="why you cited it")
vant_citations_list()        # every recorded source
vant_citations_format(commit="abc1234")   # {cited, citation} - miss reports cited:false
```

`_add` persists via the merge-under-lock path (a lock failure returns
`{added:false}`, it never pretends). `_format` verifies the commit was
cited before formatting it.

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

## Agora and Mesh Tools (11)

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

### forum_decisions

Decision trail of a forum thread (Wave U4, `labs/prd-universe.md` -
deliberation->decision records). A vote created with `thread: "PUB-..."`
is durably LINKED to that thread (`state/forum-threads.json`, WAL-
backed); when the consensus tally resolves, the decision record carries
the thread and the trail reads back the whole story:

```text
forum_decisions(thread="PUB-1791683525171")
-> { ok: true, thread, topic, proposal, author,
    ledger: { status, ballot, minQuorum, hash },
    votes: [ { voter, outcome, votedAt } ... ],
    holds: [ { holdId: "forum:<topic>", held, condition } ... ],
    decision: { winner, votes, percentage, decidedAt },
    outcome: "yes" }
```

- `votes` comes from the consensus ledger (per-voter outcomes)
- `holds` reports the escrow hold touched under the consensus hold id
  (`forum:<topic>`) - present while held, empty after release
- `decision`/`outcome` appear once the tally resolves and the decision
  return path records it (persisted; survives restart)

No link -> typed `E_FORUM_ABSENT` (never a silent empty trail).
Companion `forum_thread_links` lists every linked thread with its
decided/open state. CLI: `vant forum decisions <barcode>` (+ `--json`)
and `vant forum links`.

### forum_publish

Publish to the agora forum. Tenancy (pass 87): the workspace is stamped
from the VERIFIED subject (token > declared `userCtx` > current agent
identity > anonymous). An anonymous or unpinned identified publish lands
on the GLOBAL commons (pre-87 behavior preserved); `workspace: ""` pins
a global post even under an identity; pinning a FOREIGN workspace needs
a registry role there (else `workspace_denied`); invalid names fail
closed (`invalid_workspace`).

**Params:**
| Param | Type | What |
|-------|------|------|
| title | string | Publication title (required) |
| content | string | Body (required) |
| tags | string[] | Optional tags |
| workspace | string | Optional tenant board, or `""` for global (membership enforced) |
| userCtx | object | Legacy self-declared subject (loses to a verified token) |

### forum_list

List agora publications visible to YOUR tenancy: the global commons
plus your own workspace; cross-tenant needs a registry role there.
Anonymous sees global only - tenant posts fail closed (invisible, not
leaked). Returns `tenancy` metadata (`workspace`, `anonymous`,
`visible`, `total`).

**Params:**
| Param | Type | What |
|-------|------|------|
| userCtx | object | Legacy self-declared subject (loses to a verified token) |

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

List messages in a channel (`channel`, optional `limit`). Answers the
channel's FIFO tail (pass 214 also fixed this verb: it previously called
`Msg.list()` and returned the conversation roster, ignoring its arguments).

Per-tenant posture (pass 214): msg channels carry a claim-once owner ref
(`msg.send(chan, msg, { scopeOwner })` stamps a NEW channel;
`msg.setChannelOwner` claims unowned ones and refuses steals). The door
withholds another tenant's scoped channel from guests on `msg_list` and
refuses their `msg_send` typed (`E_TENANT_CHANNEL`) before the write.
Unscoped channels stay public.

## Domains A-Z param tables

Every published tool (except those documented fully in the sections above) as a param table - straight from the registered inputSchema.

**agora**:

| Tool | Params (required first) |
|------|-------------------------|
| agora_nodes | - |
| agora_pull | node, topic - required: node, topic |
| agora_push | node, topic - required: node, topic |
| agora_sync_status | - |
| agora_vote | node, topic, outcome, agentId - required: node, topic, outcome |

**audit**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_audit_list | limit |
| vant_audit_log | event, data - required: event |

**auth**:

| Tool | Params (required first) |
|------|-------------------------|
| auth_create | userId, roles - required: userId |
| auth_require | token, permission - required: token |
| auth_verify | token - required: token |

**bulk**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_bulk_create_islands | islands - required: islands |

**call**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_call | name, args - required: name |

**commit**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_commit | message, agentId - required: message |

**create**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_create_branch | name - required: name |
| vant_create_island | name, type, triggers - required: name |

**delete**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_delete_island | name - required: name |

**disable**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_disable_island | name - required: name |

**enable**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_enable_island | name - required: name |

**export**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_export_islands | - |

**find**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_find_islands_by_trigger | trigger - required: trigger |

**framework**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_framework_status | - |

**get**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_get_island | name - required: name |
| vant_get_islands | - |
| vant_get_memory | category, filename - required: category, filename |

**governance**:

| Tool | Params (required first) |
|------|-------------------------|
| governance_decide | topic, context - required: topic |
| governance_history | limit |
| governance_isAllowed | action, entity - required: action |
| governance_stats | - |

**health**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_health | - |

**list**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_list_branches | - |

**load**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_load_island | name - required: name |

**nodes**:

| Tool | Params (required first) |
|------|-------------------------|
| nodes_list | - |

**qos**:

| Tool | Params (required first) |
|------|-------------------------|
| qos_canProceed | key, limit - required: key |
| qos_checkQuota | input, maxSize - required: input |
| qos_recordFailure | key, count - required: key |
| qos_withTimeout | task, ms - required: task |

**rerank**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_rerank | query, docs - required: query, docs |

**sandbox**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_sandbox_status | - |

**search**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_search | query, limit - required: query |
| vant_search_hybrid | query, topK |
| vant_search_hyde | query, topK |
| vant_search_multiquery | query, topK |
| vant_search_semantic | query, limit - required: query |

**set**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_set_memory | category, filename, content - required: category, filename, content |

**shell**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_shell_capture | cmd |
| vant_shell_exec | cmd, timeout |
| vant_shell_spawn | cmd |

**skill**:

| Tool | Params (required first) |
|------|-------------------------|
| skill_proto_list | - |
| skill_proto_load | name - required: name |

**stego**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_stego_decode | image, password - required: image |
| vant_stego_encode | image, message, output, password - required: image, message, output |

**storage**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_storage_cp | src, dest |
| vant_storage_exists | path - required: path |
| vant_storage_list | dir - required: dir |
| vant_storage_listRecursive | dir |
| vant_storage_mkdir | dir |
| vant_storage_read | path - required: path |
| vant_storage_rm | path, recursive |
| vant_storage_write | path, content - required: path, content |

**stream**:

| Tool | Params (required first) |
|------|-------------------------|
| stream_complete | id, result - required: id, result |
| stream_create | stream, options - required: stream |
| stream_delete | stream - required: stream |
| stream_enqueue | stream, task - required: stream, task |
| stream_fail | id, error - required: id, error |
| stream_info | stream - required: stream |
| stream_lease | workId, agentId, ttl - required: workId, agentId |
| stream_list | stream, status |
| stream_peek | stream - required: stream |
| stream_poll | stream - required: stream |
| stream_release | workId - required: workId |
| stream_stats | - |
| stream_watch | event |

**succession**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_succession_info | - |

**sudo**:

| Tool | Params (required first) |
|------|-------------------------|
| sudo_can | agentId, action - required: agentId, action |
| sudo_escalate | task, level - required: task |
| sudo_grant | agentId, capability - required: agentId, capability |
| sudo_listTasks | - |
| sudo_revoke | agentId, capability - required: agentId, capability |
| vant_sudo_can | taskId, scope |
| vant_sudo_createTask | taskId, scopes |
| vant_sudo_escalate | taskId, scope, reason |
| vant_sudo_getLayerStatus | - |
| vant_sudo_getScopes | - |
| vant_sudo_getTask | taskId |
| vant_sudo_grant | taskId, scope |
| vant_sudo_listTasks | - |
| vant_sudo_revoke | taskId, scope |
| vant_sudo_suggest | taskId |

**switch**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_switch_branch | name - required: name |

**sync**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_sync | - |
| vant_sync_pullAny | - |
| vant_sync_pushAll | message |
| vant_sync_rebase | provider |
| vant_sync_status | - |

**teams**:

| Tool | Params (required first) |
|------|-------------------------|
| teams_assign | agentId, org, dept, team, role, reportsTo - required: agentId |
| teams_createDept | name, org, desc - required: name |
| teams_createOrg | name, plan, desc - required: name |
| teams_createRole | name, org, team, permissions - required: name |
| teams_createTeam | name, dept, desc - required: name |
| teams_getOrg | id - required: id |
| teams_hasPermission | agentId, permission - required: agentId, permission |
| teams_listDepts | org |
| teams_listOrgs | - |
| teams_listTeams | dept |

**tmp**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_tmp_cacheClear | - |
| vant_tmp_cacheGet | key |
| vant_tmp_cacheSet | key, value, ttl |
| vant_tmp_dropboxClear | - |
| vant_tmp_dropboxDelete | name |
| vant_tmp_dropboxGet | name |
| vant_tmp_dropboxList | - |
| vant_tmp_dropboxPut | name, content |
| vant_tmp_get | space, name |
| vant_tmp_list | space |
| vant_tmp_myStuffDelete | name |
| vant_tmp_myStuffGet | name |
| vant_tmp_myStuffList | - |
| vant_tmp_myStuffPut | name, content |
| vant_tmp_put | space, name, content |
| vant_tmp_yourStuffDelete | name |
| vant_tmp_yourStuffGet | name |
| vant_tmp_yourStuffList | - |
| vant_tmp_yourStuffPut | name, content |

**trust**:

| Tool | Params (required first) |
|------|-------------------------|
| trust_can | entityId, action - required: entityId, action |
| trust_getScore | entityId - required: entityId |
| trust_leaderboard | limit |
| trust_record | entityId, type, positive, value, note - required: entityId, type |
| trust_setRequired | permission, minTrust - required: permission, minTrust |

**update**:

| Tool | Params (required first) |
|------|-------------------------|
| vant_update_island_triggers | name, triggers - required: name, triggers |

---

## Remaining Tools (pass-190 crosscheck)

Caught by the coverage crosscheck - no prose for these (yet); params are exact from the registry.

| Tool | Params (required first) |
|------|-------------------------|
| brain_load | brains, type - required: brains |
| brain_current | - |
| brain_geo_brains | - |
| forum_enter | - |
| forum_message | agent, content - required: agent, content |
| forum_vote | proposal, options, minQuorum, useTrustWeight, deadline, scope, thread - required: proposal |
| forum_castVote | voteId, choice, agentId - required: voteId, choice |
| forum_decisions | thread - required: thread |
| forum_thread_links | - |
| forum_status | - |
| msg_subscribe | channel, handler - required: channel |
| recursion_register | name, type - required: name, type |
| brain_share | insight, source, tags - required: insight |
| agent_spawn | name, role, parent, brain, team, roleId, reportsTo |
| work_assign | task, agentId, name, role, budget - required: task (composition verb: spawn-or-reuse + escrow hold + delegate + era fold; typed refusals fire before side effects) |
| agent_list | - |
| agent_kill | id |
| agent_proto_list | - |
| agent_proto_load | name - required: name |
| vant_island_status | name - required: name |
| brain_evolution_start | sessionId |
| brain_evolution_end | - |
| brain_evolution_insight | insight - required: insight |
| brain_evolution_history | - |
| brain_evolution_status | - |
| vant_agents_delegate_mcp | id, task - required: id, task |
| vant_agents_broadcast | message - required: message |
| vant_compute_invoke | func, args, lang - required: func |
| vant_compute_status | - |
| market_getTrade | tradeId - required: tradeId |
| market_getBids | - |
| market_cancelTrade | tradeId, agentId - required: tradeId, agentId |
| market_skill_list | title, description, payloadKind, price, capabilityTag, context - required: title (gated: market.skillsEnabled; launch-payload listings refused) |
| market_skill_buy | listingId, buyerId, workspace - required: listingId, buyerId (escrow HOLD only; debit on confirm) |
| market_skill_deliver | tradeId, payload (≤64KB), agentId - required: tradeId, payload (agentId = seller; buyer delivery refused E_SKILL_NOT_SELLER) |
| market_skill_settle | tradeId, decision (confirm\|refute), agentId - required: tradeId, decision (agentId = buyer; confirm DEBITS once, refute releases the hold; double settlement E_SKILL_ALREADY_SETTLED) |
| market_skill_status | listingId - required: listingId (pre-trade snapshot incl. legacy + shill-resistant reputation with concentration flag) |
| market_skill_sweep | (none) - run the TTL evidence sweep: stale pending_delivery trades release their hold (no debit, no trust penalty, supply restored; TTL via market.skillsTradeTtlMs / VANT_MARKET_SKILLS_TRADE_TTL_MS, default 72h) |
| market_skill_gate | value (omit to read) - shows/toggles market.skillsEnabled (OFF by default; env alias VANT_MARKET_SKILLS_ENABLED) |

---

## Return Types

See each tool section for its exact return shape. Conventions across the
registry:

- **Failures are typed, not blessed**: handlers return `{error, code}`
  objects on failure (e.g. `{added:false, reason}`, `{encoded:false,
  error, code}`) - never a hardcoded success.
- **Verified beats declared**: RLS-credentialed tools resolve the caller's
  habitat context from the bearer token first (see the Habitat section).
- **Optional-input tools still answer**: a call with no args returns the
  honest current state (list/summary surfaces), not an invented default.

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
counts, and `workspacePools`. With `org`: that agent's budget plus the
holds map.

## Workspace Budget Tools (6)

Org pools + member caps over habitat workspaces (pass 83) - see
[Escrow workspace budgets](/reference/escrow). RLS: draws fail closed
on unknown workspaces; setting a pool or cap is admin-gated (the
admin role is verified against the habitat registry, never
self-declared).

### escrow_setWorkspaceBudget

Set a workspace's org-pool budget. **Params:** `workspaceId`,
`amount`, `adminId` (must hold admin in the workspace).

### escrow_getWorkspacePool

Read a workspace's org pool. **Params:** `workspaceId`.

### escrow_listWorkspacePools

List all org pools. No params. Returns `{ pools: [...] }`.

### escrow_setWorkspaceMemberLimit

Cap a member's draw from its workspace pool. **Params:**
`workspaceId`, `agentId`, `limit`, `adminId`.

### escrow_workspaceCanSpend

Check whether a member can draw an amount from its pool.
**Params:** `workspaceId`, `agentId`, `amount` (default 1).

### escrow_workspaceRecordSpend

Record a pool-scoped spend: debits the member row AND the org pool.
**Params:** `workspaceId`, `agentId`, `amount`.

## Habitat Tools (14)

Habitat is the RLS layer: workspaces (isolated containers), roles,
and boundary policies. These replaced the dead `vant_environment_*`
family in pass 81 - "environment" was a planned subsystem that never
shipped (scrapped in favor of habitat), but its 7 tools stayed
registered against a module that never existed: every call was
MODULE_NOT_FOUND. All habitat tools route through the shared instance
(`lib/habitat.js` `getShared()`), which boot adopts rather than
replaces. Mutations auto-persist to the brain state store. Pass 82
added the enforcement surface (`vant_habitat_can`,
`vant_habitat_check`, `vant_habitat_agentContext`) and agent
identity - see [RLS](rls.md). Pass 86 added bearer tokens anchored to
those identities (`vant_habitat_mintToken`, `vant_habitat_verifyToken`,
`vant_habitat_revokeToken`), accepted by the MCP HTTP door as a
verified RLS credential - see [RLS](rls.md).

### vant_habitat_status

Overview: workspaces, boundaries count, inputs, current workspace.
No params.

### vant_habitat_listWorkspaces

List all workspaces. No params. Returns `{ workspaces: [...] }`.

### vant_habitat_createWorkspace

Create a workspace (container). **Params:** `workspaceId` (string,
required), `options` (object: `name`, `owner`, `policy`). A geometric
address is attached when the geometry module is available.

### vant_habitat_setWorkspace

Switch the current workspace context. Params: `workspaceId` (must
exist). Session context only - deliberately not persisted.

### vant_habitat_addRole

Assign a role (`admin`/`editor`/`viewer`) to a user in a workspace.
Params: `workspaceId`, `role`, `userId`. Refuses unknown workspaces
(`HABITAT_UNKNOWN_WORKSPACE`).

### vant_habitat_getUserRoles

Read a user's roles in a workspace. Params: `workspaceId`, `userId`.

### vant_habitat_setPolicy

Set an RLS boundary policy for a resource. Params: `resource`,
`policy` (object: `readableBy`, `writableBy`, `container`, `filter`,
`mask`). Merged over defaults.

### vant_habitat_getBoundaries

List all boundary policies. No params.

### vant_habitat_can

RLS decision: can a context access a resource? **Params:** `resource`
(string, required), `userCtx` (object: `userId`, `roles`, `workspace`,
`team`, `brain` - optional), `mode` (`read` | `write`, default
`read`). Returns `{ allowed, resource, mode, workspace }`.

### vant_habitat_check

Throwing enforcement form. Same params as `vant_habitat_can`; denial
throws a coded `RLS_DENIED` error instead of returning a boolean.
Returns `{ checked: true, resource, mode }` on success.

### vant_habitat_agentContext

RLS subject for a spawned agent: its workspace, roles, team, and
brain. **Params:** `agentId` (string, required). Unknown agents
return `{ error: "AGENT_NOT_FOUND: ..." }`. See
[RLS](rls.md) for the identity model.

Same surface on the CLI: `vant habitat
<status|list|init|use|roles|grant|policy|boundaries|can|identity|token>`.

### vant_habitat_mintToken

Mint a bearer access token anchored to a spawned agent's habitat
identity. **Params:** `agentId` (string, required), `ttlMs` (number,
default 24h). Returns the raw token ONCE (only its SHA-256 hash
persists) plus the subject metadata. Fails closed with
`AGENT_NOT_FOUND` for unprovisioned agents.

### vant_habitat_verifyToken

Verify a bearer token and return its registry-verified RLS subject.
**Params:** `token` (string, required). Unknown, expired, revoked, or
identity-stripped tokens all report `{ valid: false }` - never an
error, never a guess. Role changes made after minting apply
immediately: the subject is rebuilt from the registries at verify
time, so tokens carry authority, not a snapshot.

### vant_habitat_revokeToken

Revoke by raw token or hash. **Params:** `tokenOrHash` (string,
required). Persisted - a revoked token is dead in every future
process, not just this one.

### guest_issue

Issue a guest identity for the door (H1 of #185): a `vguest_` random
token with a role, scope owner, trust level, and optional expiry.
**Params:** `name` (string, required), `role` (`observer`/`human`/
`agent`, default `human`), `scopeOwner` (a `lib/scope.js` owner ref
like `team:backend`), `trustLevel` (`high`/`medium`/`low`/`none`),
`expires` (`7d`-style spec or ms). Returns the raw token ONCE (the
ledger stores only the SHA-256 hash). Admin-only.

### guest_list

The guest roster as public projections (no hashes, no secrets).
**Params:** None. Admin-only - the door gate refuses `guest_list` for
any guest token (the issue's enumeration defense).

### guest_revoke

Revoke a guest by id or name. Denylist-backed: the hold of that token
is locked out at once, in every future process. **Params:** `id`
(string, required). Admin-only.

### era_start / era_log / era_close / era_current / era_list

The era-session ledger twins (#177-#179): `era_start` opens a work era,
`era_log` appends an entry, `era_close` closes with a rollup,
`era_current` reads the open era, `era_list` lists closed eras.
**Params:** verb-specific (see `vant era --help`); all handlers route
through `lib/era.js`.

### era_trace

Trace: the execution-span tail for this wake - span waterfall metadata
(count, failures with typed codes, slowest span), bounded at 500. Debug
aid; spans ride era close via `lib/trace.tail()`. **Params:** None.

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
