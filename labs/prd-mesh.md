# The Vant Mesh — Federating Multiple Installs — Product Requirements Document

**Version:** 1.1
**Branch:** axolotl
**Date:** 2026-09-25 (v1.1: generalized for the public repo — the
deployment in the examples is the HOST org's own shop, offered as a
worked example; v1.0 2026-09-25: drafted)
**Status:** ACTIVE — Wave A shipped (pass 56: agora-sync MCP surface),
Wave B shipped (pass 57: genesis ceremony), Wave C shipped (pass 58:
ledger hygiene + gossip). Next: Wave D (cross-node msg).

> **Host note.** This PRD is hosted by the **Buffy Labs** org — the crew
> that builds vant itself (you are reading this in the vant repo). The
> pattern below is written generally so ANY multi-agent shop can adopt
> it. The concrete deployment used as the running example is the host's
> own: a small dev shop running three project agents plus one ops node.
> Where you read "Buffy", "Synmergia", or "Ops HQ", read "your project
> agent A/B/C" and "your coordination node".

---

## 1. Overview

One vant install makes one agent (or one crew) sovereign: persistent
memory, agora decisions, market economics, and a signed bus to peers.
**The mesh is the step beyond: N installs — each owned by a different
agent or org — federating over the bus.** Each install keeps its own
brain, its own repo, and its own protocol state; orgs cooperate through
the agora when work is joint and stay invisible to each other when it
isn't.

### Worked example: the host's deployment

```
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ Buffy Labs     │   │ Synmergia Crew │   │ Roving Crew    │
│ (vant itself)  │   │ (game client)  │   │ (client work)  │
│ repo: vant     │   │ own repo       │   │ own repo(s)    │
└───────┬────────┘   └───────┬────────┘   └───────┬────────┘
        │     HMAC-signed crew-bus envelopes      │
        └───────────────┼────────────────────────┘
                ┌───────┴─────────┐
                │  Creadev Ops HQ │  coordination, client fixes,
                │ (4th install)   │  patching, servers, CI, QC
                └─────────────────┘
```

Four installs, four brains, four repos — one per agent, plus one
coordination node. The same shape fits any shop: replace the labels
with your projects.

### Adopting the pattern (any shop)

1. Run one vant install per agent/org — its brain lives in that org's
   repo; protocol state stays runtime-local (gitignored).
2. Stand up a coordination node *if* you want a standing host for
   shop-wide proposals, QC, and observability — it is a peer with
   duties, never a master.
3. Join installs with the genesis ceremony (Wave B); cooperate via
   JV scopes (below); settle work through market/escrow.

### What is already real (pinned, passes 35–53)

- Per-node persistence surviving restarts (consensus/market/trust/msg/
  registry — Waves 1–3, prd-vant-os.md).
- HMAC-signed transport + webhook inbound gate + sandbox-gated outbound
  (crew-bus, pass 35; live-fire 42).
- Cross-machine state sync: pull/push seam, wire can never declare a
  topic passed (agora-sync, pass 49).
- Distributed agora: remote voting with owner-side gate enforcement —
  scope + registry vetting + quarantine + one vote stay on the owner
  (pass 50); two wire-adversary fixes (merge scope-filter, sender-bound
  reply legs — pass 51).
- Two real stacks forming a JV end to end: 4-ballot joint ledger from
  2 orgs, decisions crossing the boundary, escrow settlement, cold-
  process persistence (labs/node-crew/exercise-two-orgs.js, pass 52).
- Scope consistency BY DESIGN on receiving-side gates (teams refresh
  seam + stale-view rescue, pass 53).
- Escrow debit-on-trade closing the economic loop (pass 48).

## 2. Design decisions (approved by the host org, 2026-09-25)

1. **One install per agent/org, one repo each** — the mesh is the
   target topology (the host runs four; the design is N). No shared
   protocol state; cross-node is the bus.
2. **The brain rides the repo; the protocol state does not** — state
   files (models/private/<brain>/state/, orgchart/) are gitignored
   runtime-local. A clone gets the brain; the ledger history stays on
   the machine. (Existing architecture; reaffirmed here.)
3. **Wave A first: the MCP surface** — agents speak to vant through MCP
   tools; federation without tools is just scripts. Sequencing per the
   wave plan below; every backlog item is placed (§3).
4. **Dogfood immediately** — after Wave A+B, the host stands up a real
   2-node mesh (its own install + a coordination-shaped node) and runs
   an actual task through it. Scale to N only after 2 is boring.

### Decisions still open (with proposals)

- **Secret distribution for genesis** (Wave B): per-pair secrets
  (A↔B, A↔C, …) vs one shared mesh secret rotated by the coordinator.
  Proposal: per-pair, distributed by the genesis ceremony; the
  coordinator holds the roster.
- **Msg sync approach** (Wave D): conversation-snapshot sync mirroring
  agora-sync's pull/push+merge rules vs a broadcast-only channel
  dispatcher. Proposal: snapshots (bounded, merge-only) — standups need
  history, not just pings.
- **Envelope version negotiation** (Wave E): strict drop on major
  mismatch vs capability flags. Proposal: `v` field, drop-on-major-
  mismatch, log loudly.

## 3. Architecture

### Node identity (exists today)

`crewBus.configure({ name, port, secret, agentId })` + node-registry
registration + the genesis envelope handshake (demonstrated in three
harnesses). The mesh formalizes this; nothing new is invented for Wave A.

### The JV pattern (exists today, productized in Wave B)

When two orgs work together, the host org creates org > dept > team
with **both orgs' principals assigned**, and owns the topic — scope
resolves where the team registry lives (pass-50 rule). Partners vote
remotely through the owner's gates (agora-sync.vote); settlement flows
through market/escrow. A coordination node is simply the standing host
for shop-wide JVs. The pass-52 exercise is the reference: one joint
ledger, 4 ballots from 2 orgs, owner-side gates enforcing every ballot,
state surviving every process exit.

### Gap list → waves (nothing forgotten)

| Gap (source) | Wave | Status |
|---|---|---|
| agora-sync MCP surface (pass-51 backlog; federation gap 1) | **A** | shipped (pass 56) |
| Genesis ceremony `vant genesis --join` (gap 2) | **B** | shipped (pass 57) |
| Synced-ledger TTL reaper (pass-51 backlog) | **C** | shipped (pass 58) |
| Gossip pull scheduler (pass-51 backlog) | **C** | shipped (pass 58) |
| Cross-node msg (gap 3) | **D** | next |
| Envelope version compatibility (gap 4) | **E** | — |
| Coordinator observability (gap 5) | **F** | — |
| Org-model sync leg (pass-52 backlog; optional) | standing — revisit on partner growth |

## 4. Wave plan

### Wave A — agora-sync MCP surface (pass ~54)

- New MCP tools through the REAL mcp.execute door (the mcp-agora
  precedent, pass 46): `agora_vote` (vote on a peer's topic — wraps
  agoraSync.vote with the node's bus + agentId), `agora_pull` /
  `agora_push` (state sync legs), `agora_nodes` (peer roster), and
  `agora_sync_status` (pending round-trips, installed state).
- Schema-gated like every tool; scope/registry gates stay exactly where
  they are (owner-side) — the tools add NO new trust path.
- Pins: test/mcp-agora-sync.test.js through mcp.execute (tool
  registration, real vote round-trip against a stub bus, refusal
  shapes, double-vote, scope denial passthrough).
- CLI parity (optional same pass): `vant agora vote|pull|push|nodes`.

### Wave B — genesis ceremony (pass ~55)

- `vant genesis create|boot|join --join <url> --name <node> --agent <id>`:
  mutual registration, registry vetting, optional JV org-model
  assignment (org > dept > team + both principals), secret exchange via
  the approved flow (per-pair proposal above), stored through the
  existing secret store — never plaintext in config.
- The hand-rolled handshake in the exercise harnesses becomes the
  productized flow; the harness shrinks to `vant genesis join`.
- Pins: two-process genesis round-trip test; secret never in state
  files or logs (posture: secrets stay in process memory, pass-42 rule).

### Wave C — ledger hygiene + gossip (pass 58, SHIPPED)

- **TTL reaper:** synced ledgers (wire-BORN: syncedFrom-stamped AND not
  localOrigin) age out (24h default) or reap when terminal-and-
  unreferenced. Reaper runs at hydrate-adjacent call sites + interval
  callers' discretion; throttled to 1/min per bus (pass-53 precedent);
  NEVER reaps locally created ledgers — enforced INSIDE consensus
  (`reapSynced` refuses any ledger without the wire-born marks, so a
  broken caller predicate cannot leak local state). `localOrigin` is a
  birth flag set only by `consensus.create`; mergeTopic's adopt path
  records `lastSyncFrom` (audit provenance) WITHOUT branding local
  topics as synced. Reaped topics re-pullable by design (the pull seam
  is the recovery path); a msg conversation named for the topic pins it.
- **Gossip pull scheduler:** `gossipAsk` (summary leg) + `gossipRound`
  (bounded detail pulls, merge-then-pull only for topics below local
  quorum) + `startGossip`/`stopGossip` (interval loop, ×2 backoff on
  fully-failed rounds, 30-min cap, per-peer pull floor shared by
  standalone rounds). OWN-SIDE scope filter on the summary leg: a
  scoped topic is never NAMED to a non-member (pass-50 rule on the
  summary leg); reply legs sender-bound (pass-51 rule).
- Pins: test/agora-hygiene.test.js 6/6 — localOrigin hard guard (local
  ledger adopting remote ballots survives a reap-everything predicate),
  age/terminal/reference rules + throttle, reaped-then-re-pulled round
  trip, scoped-summary filter (member sees, outsider never named),
  2-node convergence (pulls only below-quorum, terminal skipped,
  per-peer floor), sender-bound gossip reply.

### Wave D — cross-node msg (pass 59, SHIPPED)

- SHIPPED (pass 59): conversation snapshots over the bus
  (crew.msg.request / crew.msg / crew.msg.push): pull/push legs
  mirroring agora-sync, merge-only adoption, bounded arrays. The JV
  standup is pinned two-process: host posts under JV scope, the joiner
  pulls through the genesis-vetted principal, joins posts locally, and
  the host's return pull converges both orgs — merge-only, the wire
  never edits local history (test/msg-sync.test.js 9/9).
- Live-fire fix shipped with it: registry `resolvePrincipal` — the
  vetted agent identity deterministically beats the crew_ transport
  self-registration when both share a node name (first-match name
  lookup was order-dependent and fail-closed the joiner's owner-side
  gate).

### Wave E — envelope version compatibility (pass ~58)

- `v` field on crew envelopes (crew.<type> payloads carry a schema
  version); strict-drop + loud log on major mismatch; minor mismatch
  tolerated. Cross-version test matrix (v(n) sender → v(n+1) receiver
  and reverse). Watch: a downgrade claim must never bypass scope gates
  (gates run on the receiver's own resolver regardless of version).

### Wave F — mesh observability (pass ~59)

- `vant mesh status`: peers (alive/stale), open topics, recent decisions,
  budgets/spend, msg channels, pending syncs. JSON mode for CI. The
  coordination node's question — "what are my agents working on, what's
  voted, what's blocked" — answered from ONE node.
- Dashboard later; CLI is the contract.

### Standing — org-model sync leg (optional)

The pass-53 stale-view rescue covers the common case (receiving-side
gates re-read the shared store on miss). A full org-model replication
leg is only worth it when partner orgs multiply or nodes stop sharing
a trust boundary. Revisit trigger: the first EXTERNAL org joining a
mesh.

## 5. Live-fire validation (the acceptance harness)

After Wave B: **a real 2-node mesh** — for the host, Buffy Labs (its
workspace) + a coordination-shaped node — running an actual task
through the Wave-A tools:

1. The coordinator proposes a QC gate via `consensus_create` (JV scope).
2. The partner votes `agora_vote` from its own workspace. Owner-side
   gates verify. Tally passes.
3. Decision broadcast returns to the coordinator's thread; `agora_pull`
   converges both ledgers; escrow settles the bounty.
4. `vant mesh status` on the coordinator shows all of it.

Then the N-node soak (the host's game-client and client-work orgs join;
your shop adds whichever orgs you have) and the first REAL cross-org
JV: a shop-wide decision made in the agora, executed by the crews,
paid through escrow — with zero custom scripts involved.

## 6. Security notes

- **Secret distribution is the crown jewel.** Per-pair HMAC secrets via
  the genesis ceremony; secrets never in state files, configs, logs, or
  the repo; rotation story in Wave B (re-genesis re-keys a pair).
- Scope/registry/quarantine gates stay owner-side (pass-50 rule) —
  every new surface (MCP tools, CLI, gossip) adds convenience, never a
  new trust path.
- Merge rules stay adopt-only-unknown + local re-derivation (pass-49
  invariant) on every new sync leg; the wire never declares truth.
- Reaper and gossip must be abuse-proof: the reaper never reaps local
  ledgers; gossip pull frequency is throttled per-peer (miss floods
  cannot turn into disk floods — the pass-53 throttle precedent).
- Envelope versioning must not enable downgrade bypasses (gates run on
  receiver-local resolvers regardless of claimed version).

## 7. Files

- New: labs/prd-mesh.md (this file).
- Wave A: lib/mcp.js (agora-sync tools), bin/vant.js + bin/help.js
  (optional CLI), test/mcp-agora-sync.test.js.
- Wave B: bin/genesis.js (+ vant route), lib/secret.js reuse,
  test/genesis-ceremony.test.js.
- Wave C: lib/agora-sync.js (reaper + gossip), test/agora-hygiene.test.js.
- Wave D: lib/msg.js + lib/agora-sync.js (msg legs), lib/node-registry.js
  (resolvePrincipal), test/msg-sync.test.js.
- Wave E: lib/crew-bus.js (v field), test/envelope-versions.test.js.
- Wave F: bin/mesh-status.js (+ route/help), test/mesh-status.test.js.

## 8. Success criteria

1. An agent in its own workspace can join, vote on, sync with, and
   settle against another org's node using ONLY MCP tools / CLI — zero
   custom scripts (Wave A+B, validated by §5's live-fire).
2. A restarted or cold node converges to the JV state without manual
   pulls (Wave C gossip + pull seam).
3. Stale synced state cannot accumulate forever (Wave C reaper) and
   cannot lie (merge re-derivation unchanged).
4. Cross-version nodes fail loudly and safely, never silently misread
   each other (Wave E).
5. A coordination node can answer "who did what, what's decided, what's
   owed" from one command (Wave F).
6. The full N-node soak: a shop-wide JV decision made in the agora,
   executed and settled by every org, cold-process verified.
