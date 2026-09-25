# Vant OS Consolidation — Pulling the Society Together — Product Requirements Document

**Version:** 1.2
**Branch:** axolotl
**Date:** 2026-09-24 (v1.2 2026-09-25: closeout + next-wave shortlist)
**Status:** COMPLETE — Waves 1-4 shipped (passes 36-39). Success criteria
met (labs/TASKS.md pass 39). Post-PRD follow-through in the agora wave
(passes 40-46): encounter/spirit/realm retired, agora loop wired
(scope + MCP surface), forum decision log made durable.

---

## 1. Overview

Vant has a dormant **"Vant OS" ecosystem layer** from an earlier era —
node-registry, encounter, relay, forum, realm, spirit, consciousness,
habitat, nature, lineage — built to make agents into a society. The
attempt stalled before it pulled together: the pieces exist and half of
them are live (node-registry is consensus's vote-verification anchor;
forum is MCP-wired), but they never formed a whole.

This PRD is the pull-together. Two moves:

1. **Persistence** — protocol state (consensus/market/msg/trust/
   node-registry) currently lives in in-memory Maps that die with the
   process. Move it to the storage layer (owner-approved **Architecture
   A**: per-module write-through, `models/private/<brain>/state/`).
2. **One transport** — crew-bus (pass 35, HMAC-signed webhook envelopes)
   **replaces relay.js** as the agent-to-agent transport (owner decision:
   wipe relay, make crew-bus the resident). encounter/spirit/forum/realm
   are **kept** for later wiring (owner decision).

The result: a node is a brain with state that survives restarts, a roster
in the registry that consensus trusts, and a signed bus to talk to peer
nodes — the substrate the old OS layer was reaching for.

### Why now

- The pass-34/35 lib census resolved all orphaned modules; the census
  flagged this ecosystem as the remaining epic.
- node-crew v0.2 (prd-node-crew.md) already called for protocol
  persistence + signed transport. Crew-bus shipped; persistence is the
  open half.
- The old layer's own seams point here: relay/msg/teams all carry
  `gatherState()/restoreState()` methods **nobody ever calls**, and
  transform.js was built as the gather engine for horcrux/backup/sync.
  The architecture always intended persisted state; it was never wired.

---

## 2. Findings: the old node system (forensics, pass 36)

| Module | Role | State | Verdict |
|---|---|---|---|
| **node-registry.js** | Peer discovery (register/discover/heartbeat/status) | `_nodes` Map, in-memory | **LIVE & canonical** — consensus verifies every vote against it (`requireRegistry` default true), counts alive peers for quorum. Genesis registers crew nodes here. **Keep; persist first.** |
| **relay.js** | Agent-to-agent transport: HTTP/WebSocket/brain/MCP | connections Map + brain-relay configs | **SUPERSEDED by crew-bus.** Only code consumer is transform's gather/restore seam (spirit mentions it in a doc comment only). Its HTTP method is unsigned and untested. **Delete; crew-bus takes the route.** |
| **encounter.js** | Agent discovery & meeting protocol | Map, in-memory | **DELETED (pass 40/41)** — discovery is node-registry + crew-bus; one identity system, zero aliases. |
| **forum.js** | 3D geometric forum (isohedrons/quasicrystal) | brain-backed + state/forum.json (pass 44) | **LIVE & agora-wired** — scope-carrying, MCP surface re-wired (pass 46), decision log durable (pass 44). |
| **realm.js** | Unified decision space (forum+consensus+governance+teams) | — | **DELETED (pass 40/41)** — was a second voting state machine; ownership concept became agora `scope`. |
| **spirit.js** | Complete autonomous agent composition | — | **DELETED (pass 40/41)** — verification/quarantine folded into trust (persisted). |
| consciousness/habitat/nature/lineage | Identity / RLS workspaces / spark engine / origins | mixed | Keep; out of scope this PRD except where persistence touches them. |
| **transform.js** | Universal gather/restore engine (23 gatherers, incl. every protocol module's state) | stateless orchestrator | **Keep — becomes the backup/audit layer** (option B demoted to backup role, per owner decision A). |
| **wal.js** | Write-ahead log module | — | Examine during Wave 1; msg JSONL may use it or follow its pattern. |
| system.js / vant.js | Layer-3 dashboards / facade | — | Consumers that will need relay references swapped to crew-bus. |

**Key insight:** crew-bus does not compete with the old OS — it completes
it. The old design had identity (node-registry), discovery (encounter),
collaboration (forum/realm), composition (spirit), but its transport
(relay) never grew teeth: no signatures, no audit chain, no tests. Crew-bus
is that transport finished properly — HMAC-signed, webhook-verified,
sandbox-gated outbound, 13/13 pinned.

---

## 3. Owner Decisions (2026-09-24)

1. **Architecture A** — per-module write-through persistence. Each module
   saves via the storage layer on mutation, hydrates on boot through
   `brain.register` DI. transform.js stays as the backup/audit gather
   layer (its gather→horcrux/backup path becomes "blessed snapshots").
2. **relay.js is wiped and replaced** — crew-bus becomes the transport
   resident. Whether that means `lib/crew-bus.js` content moves into
   `lib/relay.js` or relay dies and references point at crew-bus is an
   implementation detail decided by the no-legacy rule: **one name, one
   job, zero aliases.** Chosen: **delete relay.js; keep `lib/crew-bus.js`
   as the name** (it's tested 13/13, has a fresh suite, and "bus" is the
   honest word for what it does). transform/system references to relay's
   gather/restore seam move to crew-bus equivalents.
3. **encounter/spirit/forum/realm stay** — wire later.
4. **State home: `models/private/<brain>/state/`** — brain-scoped so
   multibrain isolation holds; gitignored like all runtime state; gated
   by the sandbox/storage chain like every other models/ write.

---

## 4. Architecture A: Persistence Contract

### Where

``` 
models/private/<brain>/state/
  node-registry.json       # peer table (host/port/status/lastSeen)  [Wave 1 ✓]
  trust.json               # scores/karma/roleTrust/history tail       [Wave 2 ✓]
  msg-conversations.json   # conversation snapshots (channels are      [Wave 2 ✓]
                           # no-history IPC — never persisted)
  consensus.json           # topic ledgers incl. votes (lock points)   [Wave 3 ✓]
  market.json              # listings/bids/trades (commit points)      [Wave 3 ✓]
```

All files carry `{ kind: 'vant-protocol-state', module: <name> }` — the
live-format marker lib/migrations' legacy-dropfile detector skips (a
content-based detector without a live allowlist eats new state formats
as "legacy"; that near-miss was caught live in pass 37).

**Implementation note (Wave 2):** the rules above live in ONE shared
module, `lib/state-store.js` (hydrate/persist/clear) — every protocol
module rides it; no module-local copies. state-store resolves the brain
per call (VANT_BRAIN env override > currentBrain, matching
getBrainPath semantics).

### Rules (per module)

1. **Write-through on mutation** — every state-changing call persists
   before returning (the modules are already lock-chained where races
   matter: consensus `_lockTopic`, market atomic reserve; writes
   serialize the same way).
2. **Hydrate on first touch** — lazy load on module init via
   `brain.register` DI wiring (boot.js registers the loader; first API
   call hydrates if not yet). Missing/corrupt file = start empty, log,
   never crash the boot.
3. **Read-denial ≠ reset** — pass-31 rule (agents/internal.js) applies
   everywhere: a sandbox read denial throws structured
   (`E_STATE_READ`-class codes), it never silently wipes state. Only
   parse failures may reset, and they must log loudly.
4. **Storage layer only** — all reads/writes go through FileStorage
   (sandbox → vaf chain), never raw fs. Same discipline as brain files.
5. **Atomic writes** — storage layer's atomic-write path (tmp+rename)
   for JSON snapshots; JSONL appends for logs.
6. **worker-thread semantics fixed for free** — per-thread Maps become
   disk-shared state on the same machine; cross-machine peers sync via
   crew-bus envelopes. Document in each module header.

### What persists per module (Wave 1-3 scope)

| Module | Persisted | Cadence |
|---|---|---|
| node-registry | full peer table | on register/heartbeat/unregister | ✅ Wave 1 |
| trust | scores + karma + roleTrust + history tail (bounded 100) | on record/setRequired/reset/import | ✅ Wave 2 |
| msg | conversation snapshots (bounded arrays, participants; Sets↔Arrays) | on create/post/reply/participants/delete | ✅ Wave 2 |
| consensus | topic ledgers + votes + status | at lock points (create/vote/resolve/tally transitions) | ✅ Wave 3 |
| market | listings + bids + trades (supply serialized; _reserved reset on hydrate) | at commit points (list/bid/trade settle/cancel) | ✅ Wave 3 |

Escrow stays in-memory this PRD (known non-blocker, holds don't debit).

---

## 5. Wave Plan

### Wave 1 — foundation (pass ~36)
- **node-registry persistence** (consensus's trust anchor; smallest,
  highest leverage). Hydrate + write-through + `E_STATE_READ` pin.
- **crew-bus ↔ node-registry interop**: `crewBus.listen()` auto-registers
  the node into node-registry (name, port, status alive, heartbeat via
  existing `register()` path). Crew nodes become first-class registry
  peers that consensus can verify.
- Read wal.js; decide use-vs-pattern for msg JSONL.
- Sweep green + new pins.

### Wave 2 — memory & scores (pass ~37) ✅
- **trust.json** (write-through on score change). ✅
- msg: **conversation snapshots**, not channel JSONL — the PRD's
  channel-JSONL sketch was corrected on implementation: channels are
  no-history IPC by design; the conversation (bounded message arrays +
  participants) is msg's history unit. wal.js verdict: follow its
  append pattern, never the class (replay semantics misbehave on
  appends). ✅
- **lib/state-store.js** extracted: the ONE implementation of the arch-A
  rules (registry refactored onto it). ✅
- transform.js: relay gather/restore seam → crew-bus status/secret-free
  peer topology (restore NEVER fabricates secrets). ✅
- Migration safety: kind-marker on all state files; legacy-dropfile
  detector skips them (near-miss: migrate() relocated a real trust.json
  before the fix). ✅
- Sweep 116/116 + pins. ✅

### Wave 3 — ledgers (pass ~38) ✅
- **consensus.json** at lock points: create/vote/resolve + status
  transitions (expired/passed/rejected). One snapshot file per brain
  (topic count is bounded by maxLedgers=100; per-topic files are
  overkill at that scale). Hydrate on load. `list()`/`resolve()`
  hydrate too (cold-process safe). ✅
- **market.json** at settle points: list/bid/trade-commit/cancelTrade.
  Serialization deltas: `supply: Infinity` ↔ `supply: null` (scarcity
  opt-out must round-trip); `_reserved` (in-flight reserve accounting)
  never persists — hydrate resets it to 0 so a crash can't resurrect a
  phantom reservation. ✅
- **Consent passthrough (bug found by the pin):** market list/bid/trade
  hardcoded `consentGiven: false` (trade ignored context entirely), so
  the governance consent gate could never pass. Context now flows.
- **canTrade capability (bug found by the pin):** market.trade() asks
  the gate for `canTrade` but Sandbox never declared it — an explicitly
  configured sandbox always denied and no caller could grant it.
  Declared in DEFAULT_CAPABILITIES (deny-by-default).
- **Barter-price budget check (bug found by the pin):** `_checkBudget`
  passed string prices ('favor:review') into escrow's numeric
  `available >= amount` comparison → NaN → every barter trade denied
  'Insufficient budget'. Non-numeric prices skip the escrow check
  (no cost to debit); numeric credit-mode amounts unchanged. ✅
- Sweep green + new pins. ✅

### Wave 4 — relay removal + OS wiring (pass ~39) ✅
- **relay.js deleted** (lib + bin/relay.js CLI + test/relay.test.js); the
  transform relay restore branch removed — legacy data.relay payloads in
  old horcrux/backup files are ignored (crew-bus topology is the live
  gather payload). Routing/help/docs references stripped; spirit.js header
  comment now names crew-bus. no-legacy-bloat pin added (relay stays
  deleted; no route, no help card, no require). ✅
- **Crew demo v0.2 shipped** (labs/node-crew/demo-v02.js): TWO REAL node
  processes — master creates+vets a consensus topic, casts its vote, then
  sends a signed genesis envelope over crew-bus; the peer verifies,
  dispatches, casts ITS vote in its own process against its own registry
  view, and a cold third process tallies the RESTARTED state (2 votes,
  ratify, passed). 4/4 phases ×3 consecutive runs; v0.1 demo still 9/9.
  Setup notes baked into the demo: network allowlist takes HOSTNAMES
  ('127.0.0.1', not origin URLs); a peer re-hydrates consensus before
  voting on a topic another process created (its boot-hydrated map is
  stale by definition). ✅
- **Dead-export sweep:** zero live requires of relay anywhere (lib/bin/
test/scripts); relay's brain-config exports had no external consumers;
  crew-bus already exposes the full transport surface (send/broadcast/
  nodes/status). STABILITY.md non-blocker "protocol state in-memory only"
  → CLOSED (Waves 1-3). ✅
- Sweep 116/116 (relay suite gone) + docs style/links PASS. ✅

### Out of scope (this PRD)
- ~~encounter/spirit/forum/realm wiring (kept, not wired).~~ RESOLVED in
  the agora wave (passes 40-46): encounter/spirit/realm retired; forum
  wired as the agora's discussion leg.
- escrow debit-on-trade (separate rc candidate) — see Next Wave below.
- Cross-machine state sync beyond crew-bus envelopes (no replication
  protocol yet — state is per-node, transport is the sync) — see Next
  Wave below.

---

## Next Wave — candidates (2026-09-25, owner shortlist)

The agora loop (forum → market → consensus → back) is now
restart-durable, scope-aware, and MCP-surfaced end to end. The three
live candidates for the next PRD, all building on that substrate:

1. ~~**Escrow debit-on-trade.**~~ **SHIPPED (pass 48):** trades now debit
   the buyer's escrow budget at the settle point (`escrow.recordSpend` for
   numeric prices; missing/zero price costs the default 1; barter strings
   stay free). Debit refusal unwinds reservation + hold; `trade.debit`
   records the settlement. Pinned test/market-debit.test.js 4/4.

2. ~~**Cross-machine state sync.**~~ **SHIPPED (pass 49) as a pull/push
   seam, not replication:** `lib/agora-sync.js` runs a signed round-trip
   over the crew-bus — `crew.state.request` → `crew.state` reply (pull)
   and `crew.state.push` (return leg after voting). Consensus gained
   `exportTopic`/`mergeTopic`; merge adopts only unknown agents' ballots,
   stamps `syncedFrom` provenance, and RE-DERIVES status/outcomes/hash
   locally via tally() — the wire can never declare a topic passed.
   Scope rides the payload so crew-bus's pass-40 gate keeps scoped topics
   invisible to non-members on both legs. Live 2-process probe: node A
   creates + votes, node B pulls, votes, pushes — both nodes tally
   PASSED with 2 votes. Pinned test/agora-sync.test.js 5/5.

3. **Distributed agora.** Decisions owned by a team on node A, voted on
   by peers on node B, with the full scope + registry-verification chain
   across the bus. Scope records already ride crew.forum/market/decision
   envelopes (pass 40); what's missing is the cross-node enforcement
   path (remote canAccess against a replicated member set, or scope
   resolution delegated to the owning node) plus verification of remote
   votes against the owner's registry view. Depends on (2) for coherent
   state.

Recommended order: (1) then (2) then (3) — each is a dependency of the
next; the economic loop closes before the federation work begins.
Owner to confirm sequencing before a next-wave PRD is drafted.

---

## 6. Security Notes

- All state files ride the storage chain (sandbox/vaf) — path traversal,
  symlink, and proto-pollution guards apply as everywhere else in models/.
- node-registry's role as consensus's vote anchor makes its persistence
  integrity critical: the peer table on disk is *verified* content
  (charset-validated names, port ranges), same as in-memory today.
- crew-bus keeps its posture: HMAC-signed envelopes, SSRF allowlist for
  peers, secrets never leave the process, no new crypto.
- Write-through never persists secrets (market escrow secrets, webhook
  secrets stay in process memory).

## 7. Files

- **New:** labs/prd-vant-os.md (this file)
- **Wave 1-3 touched:** lib/node-registry.js, lib/trust.js, lib/msg.js,
  lib/consensus.js, lib/market.js, lib/crew-bus.js, lib/boot.js (DI
  wiring), test pins per wave.
- **Wave 4:** lib/relay.js (deleted), lib/transform.js, lib/system.js,
  lib/vant.js, labs/node-crew/demo.js (v0.2), labs/STABILITY.md,
  labs/TASKS.md.

## 8. Success Criteria

1. ✅ Kill any node process mid-protocol; restart; consensus topics,
   market listings, trust scores, registry peers, and msg conversations
   are intact (process-death round-trip pins, Waves 1-3).
2. ✅ `vant` runs with zero in-memory-only protocol state (STABILITY.md
   non-blocker CLOSED, pass 39).
3. ✅ Crew demo v0.2: two real processes, one genesis, signed transport,
   registry-verified votes from both nodes, cold-process tally — 4/4
   phases ×3 consecutive runs (pass 39).
4. ✅ Full sweep green with every new pin; no-legacy policy intact (relay
   deleted + pinned deleted, no aliases).
