# The Shop Mesh — Four Vant Installs, One Dev Shop — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-09-25
**Status:** PROPOSED — direction owner-approved (2026-09-25). Wave A
(agora-sync MCP surface) ready to start immediately.

---

## 1. Overview

Creadev is a dev shop running on agents: **Buffy** (vant, this repo),
a **Synmergia agent** (Godot MMORPG), and a **third agent** (roving —
currently the music-festival WordPress plugin + theme, other projects
beyond). The owner's deployment plan:

- **Four separate vant installs (orgs), one per agent**, plus a fourth
  for **Creadev.org Ops**: orchestration, client fixes, patching,
  servers, CI, QC, whatever else the shop needs.
- Each install lives in its **own repo**; each agent works in its own
  workspace (Freebuff-style) running its own node.
- Cross-shop work = the agora: Creadev Ops proposes, the relevant orgs
  vote through their own gates, escrow settles the economics, decisions
  flow back to the threads.

**The dogfooding principle:** *use vant to build vant* — and everything
else. Buffy is vant's builder AND its first real user; the pass-52
two-org JV exercise simulated this deployment and its findings (teams
hydration gap, closed pass 53) made vant more real for the actual shop.
Vant's development process has become a vant workload.

### The mesh map

```
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ Buffy Labs     │   │ Synmergia Crew │   │ Roving Crew    │
│ (vant dev)     │   │ (godot MMORPG) │   │ (wp + others)  │
│ repo: vant     │   │ own repo       │   │ own repo(s)    │
└───────┬────────┘   └───────┬────────┘   └───────┬────────┘
        │      HMAC-signed crew-bus envelopes     │
        └───────────────┼────────────────────────┘
                ┌───────┴─────────┐
                │ Creadev Ops HQ  │  orchestration, client fixes,
                │ (4th install)   │  patching, servers, CI, QC
                └─────────────────┘
```

Four installs, four brains, four repos. Org-scoped decisions stay
org-scoped (scope contract, labs/prd-agora.md §3); joint work is a JV:
a team scope containing both orgs' principals, owned by whichever node
hosts the org model (pass-50 rule: scope resolves where the team
registry lives).

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

## 2. Owner decisions (2026-09-25)

1. **Four installs, four repos, one per agent + Ops HQ** — the mesh is
   the target topology. No shared protocol state; cross-node is the bus.
2. **The brain rides the repo; the protocol state does not** — state
   files (models/private/<brain>/state/, orgchart/) are gitignored
   runtime-local. A clone gets the brain; the ledger history stays on
   the machine. (Existing architecture; reaffirmed here.)
3. **Wave A first: the MCP surface** — agents speak to vant through MCP
   tools; federation without tools is just scripts. Sequencing per the
   wave plan below; the pass-51/52 backlog items are all placed (§5).
4. **Dogfood immediately** — after Wave A+B, stand up a real 2-node mesh
   (Buffy Labs + a Creadev-Ops-shaped node) and run an actual task
   through it. Scale to 4 only after 2 is boring.

### Decisions still open (owner to confirm in-wave)

- **Secret distribution for genesis** (Wave B): per-pair secrets
  (A↔B, A↔C, …) vs one shared mesh secret rotated by Ops. Proposal:
  per-pair, distributed by the genesis ceremony, Ops holds the roster.
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

Host org creates org > dept > team with both orgs' principals; the host
owns the topic; partners vote remotely through the owner's gates
(agora-sync.vote); settlement via market/escrow. Creadev Ops is the
standing JV host for shop-wide decisions.

### Gap list → waves (nothing forgotten)

| Gap (source) | Wave |
|---|---|
| agora-sync MCP surface (pass-51 backlog; §1 gap 1) | **A** |
| Genesis ceremony `vant genesis --join` (§1 gap 2) | **B** |
| Synced-ledger TTL reaper (pass-51 backlog) | **C** |
| Gossip pull scheduler (pass-51 backlog) | **C** |
| Cross-node msg (§1 gap 3) | **D** |
| Envelope version compatibility (§1 gap 4) | **E** |
| HQ observability (§1 gap 5) | **F** |
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
  the owner-approved flow (per-pair proposal above), stored through the
  existing secret store — never plaintext in config.
- The pass-52 exercise's hand-rolled handshake becomes the productized
  flow; the harness shrinks to `vant genesis join`.
- Pins: two-process genesis round-trip test; secret never in state
  files or logs (posture: secrets stay in process memory, pass-42 rule).

### Wave C — ledger hygiene + gossip (pass ~56)

- **TTL reaper:** synced ledgers (syncedFrom-stamped) age out unless
  locally owned or terminal-and-referenced. Reaper runs at hydrate +
  interval; NEVER reaps locally-created ledgers; reaped topics
  re-pullable by design (the pull seam is the recovery path).
- **Gossip pull scheduler:** interval-based pulls of topic lists from
  registered peers (backoff + jitter), so peers converge without manual
  pulls. Bounded: pull summaries first, merge-then-pull-details only
  for topics below local quorum.
- Pins: reaper never touches local ledgers; reaped-then-re-pulled
  round-trip; gossip convergence (2 stub nodes, N topics) + offline
  peer backoff.

### Wave D — cross-node msg (pass ~57, approach per owner)

- Conversation snapshots over the bus (crew.msg envelopes): pull/push
  legs mirroring agora-sync, merge-only adoption, bounded arrays.
- The JV standup: both orgs read the joint channel; participants carry
  scope so a team channel stays team-invisible cross-node.

### Wave E — envelope version compatibility (pass ~58)

- `v` field on crew envelopes (crew.<type> payloads carry a schema
  version); strict-drop + loud log on major mismatch; minor mismatch
  tolerated. Cross-version test matrix (v(n) sender → v(n+1) receiver
  and reverse). Watch: a downgrade claim must never bypass scope gates
  (gates run on the receiver's own resolver regardless of version).

### Wave F — HQ observability (pass ~59)

- `vant mesh status`: peers (alive/stale), open topics, recent decisions,
  budgets/spend, msg channels, pending syncs. JSON mode for CI. The
  Creadev Ops question — "what are my agents working on, what's voted,
  what's blocked" — answered from ONE node.
- Dashboard later; CLI is the contract.

### Standing — org-model sync leg (optional)

The pass-53 stale-view rescue covers the common case (receiving-side
gates re-read the shared store on miss). A full org-model replication
leg is only worth it when partner orgs multiply beyond the shop or
nodes stop sharing a trust boundary. Revisit trigger: first EXTERNAL
org joining the mesh.

## 5. Live-fire validation (the acceptance harness)

After Wave B: **the real 2-node mesh** — Buffy Labs (this workspace) +
a Creadev-Ops-shaped node — running an actual task through the Wave-A
tools:

1. Ops proposes a QC gate via `consensus_create` (JV scope).
2. Buffy votes `agora_vote` from its own workspace. Owner-side gates
   verify. Tally passes.
3. Decision broadcast returns to Ops' thread; `agora_pull` converges
   both ledgers; escrow settles the bounty.
4. `vant mesh status` on Ops shows all of it.

Then the 4-node soak (Synmergia + Roving join) and the first REAL
cross-project JV: a shop-wide decision made in the agora, executed by
the crews, paid through escrow — with zero custom scripts involved.

## 6. Security notes

- **Secret distribution is the crown jewel.** Per-pair HMAC secrets via
  the genesis ceremony; secrets never in state files, configs, logs, or
  the repo; rotation story in Wave B (re-genesis re-keys a pair).
- Scope/registry/quarantine gates stay owner-side (pass-50 rule) —
  every new surface (MCP tools, CLI, gossip) adds convenience, never a
  new trust path.
- Merge rules stay adopt-only-unknown + local re-derivation (pass-49
  invariant) on every new sync leg; the wire never declares truth.
- Reaper and gossip must be abusable-proof: reaper never reaps local
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
- Wave D: lib/msg.js + lib/agora-sync.js (msg legs), test/msg-sync.test.js.
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
5. Ops can answer "who did what, what's decided, what's owed" from one
   command (Wave F).
6. The full 4-node soak: a shop-wide JV decision made in the agora,
   executed and settled by all four orgs, cold-process verified.
