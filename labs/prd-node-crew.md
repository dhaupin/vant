# Vant Node Crew — Multi-Brain Parallel Society — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-09-24
**Status:** Implemented (v0.1 — labs/node-crew/demo.js, 9/9 phases, idempotent)

---

## 1. Overview

A **node crew** is a society of independent Vant brains running in parallel
processes, each a full node: its own private brain, agent roster, org
chart, and security chain — cooperating over the shared protocol layer
(consensus ledgers, governance decisions, knowledge market, message
channels, trust scores, stego-embedded soul horcruxes).

One node is elected **master**: it seeds a shared genesis — consensus
topics, governance decisions, market listings, trust — then embeds its
soul (identity, learnings, crew manifest, protocol snapshot) into a
steganographic SVG horcrux that every other node can verify and restore
from. This is the hub for "run vant in parallel" work: the demo proves
the protocol paths work end-to-end with zero new backend code; everything
built here composes existing primitives.

### Why

- **Parallelism is the product**: Vant's multibrain design (per-brain
  orgchart stores, brain-scoped paths, brain-scoped configs) already
  isolates N societies on one repo. Nothing exercised it end-to-end.
- **Protocol stress**: consensus/governance/market each guard their own
  security chain (VAF → sandbox → escrow → trust → governance). Running
  them from *multiple* spawned agents is the honest test.
- **Soul portability**: stego horcruxes are the transfer medium between
  nodes (see docs/memory/horcrux.md). A crew seed that cannot round-trip
  its own genesis is broken by definition.

### Non-Goals (v0.1)

- No network transport — nodes share one repo/filesystem (the store IS
  the message bus).
- No live agent LLMs — crew members are protocol actors (spawned via
  `agents.spawn`, driving real consensus/market/msg calls).
- No UI — `node labs/node-crew/demo.js` output is the interface.

---

## 2. Architecture

```
                    ┌────────────────────────────┐
                    │  MASTER NODE (brain: vant) │
                    │  seeds genesis:            │
                    │   consensus topics         │
                    │   governance decisions     │
                    │   market listings          │
                    │   trust scores             │
                    │   msg channels             │
                    │  → soul.svg (stego)        │
                    └──────────┬─────────────────┘
                               │  soul horcrux (decode/verify)
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  ┌───────────┐          ┌───────────┐          ┌───────────┐
  │ node aria │          │ node volt │          │ node <n>  │
  │ (own brain│          │ (own brain│          │  ...      │
  │  + agents)│          │  + agents)│          │           │
  └─────┬─────┘          └─────┬─────┘          └───────────┘
        │  vote / bid / trade / post / record — real lib calls
        └──────────────────────┴──────────────────────┘
                               ▼
              shared protocol state (orgchart stores, ledgers)
```

### Node Isolation (what multibrain already gives us)

| Surface | Per-node scope | Where |
|---------|----------------|-------|
| Brain files | `models/private/<brain>/` | brain.js multibrain |
| Agent roster | `models/private/<brain>/orgchart/agents.json` | agents/internal.js |
| Org teams | `models/private/<brain>/orgchart/teams.json` | teams.js (pass 28) |
| Escrow | `models/private/<brain>/orgchart/escrow.json` | escrow.js (pass 28) |
| Brain config | `brainConfig.<brain>.*` | governance/config (pass 26) |
| Soul | `models/private/<brain>/boot/*.svg` | horcrux boot dir |

Process model (v0.1, SHIPPED): **in-process protocol actors** — crew
members are real spawned agents participating through the protocol-layer
module singletons. Pass-30 finding: `worker_threads` were tried first and
do NOT share module state (consensus ledgers, market listings, msg
conversations and trust scores are in-memory Maps — crew votes cast in a
thread vanished into thread-local maps). True parallel nodes require the
v0.2 protocol-persistence step below.

Process model roadmap:
- v0.2: persist protocol state through the storage layer (orgchart-store
  pattern) so worker_threads/processes can share ledgers, then restore
  thread-based crew participation.
- v0.3: process-per-node (needs repo-lock coordination for orgchart
  stores first; wal.js append-only logs already exist).

### Protocol Participation Matrix

| Node | Consensus | Governance | Market | Msg | Trust | Soul |
|------|-----------|------------|--------|-----|-------|------|
| master | creates topics, votes | decides, records | lists knowledge | opens #genesis | seeds scores | embeds stego horcrux |
| crew | votes on topics | proposes via decide() | bids + trades | posts/replies | records interactions | verifies + restores genesis |

---

## 3. Protocol Calls (all real lib APIs)

```
brain.write(category, key, content, { brain: <name> }) → per-brain memory

agents.spawn({ name, role, org }) → { id, name, brain } (sandbox.canSpawn
  gate; binds current brain automatically)

// NODE IDENTITY — the real "node" concept (pass-30 finding: consensus
// votes verify voters against THIS registry by default):
nodeRegistry.register({ id, name, metadata }) → auto-heartbeats to 'alive'
nodeRegistry.getStats() → { total, alive, joining, dead }

consensus.create(topic, { options: ['a','b'], minQuorum, threshold })
  → ASYNC (lock-chained); topic charset [a-zA-Z0-9_-] (no colons);
  topics cannot be recreated (E_COLLISION) — use run-scoped names
consensus.vote(topic, outcome, agentId) → ASYNC; voter must be a live
  node in node-registry (ledger.requireRegistry defaults true)
consensus.tally(topic) → sync; counts are TRUST-WEIGHTED (each vote
  counts as the voter's trust score, not 1) — assert on totalVotes +
  leading, not raw counts

market.list(type, { title, description, price, tags }, { agentId, consentGiven })
market.bid(title, { description, reward, bidder }, { agentId, consentGiven })
market.trade(listingId, buyerId, { agentId, consentGiven })
  → canTrade is a DISTINCT capability from canWrite (list/bid need
  canWrite; trade is gated once the sandbox is explicitly configured)
market.stats()

msg.create({ id }) → msg.post(id, text, { author }) → msg.messages(id)
  (returns array; post flows QoS rate-limit + escrow quota — stagger)

trust.record(agentId, 'help', { positive: true, value })
trust.recordTrade(seller, buyer, price)
trust.getScore(agentId) / trust.leaderboard()

stego.encodeSvg(message, carrierSvg, password)  // message FIRST
stego.decodeSvg(encodedSvg, password) → { message }
```

---

## 4. The Genesis Script (what the demo actually does)

1. **Seed master memory** — `brain.write('lessons', ...)` etc. into the
   master brain.
2. **Spawn crew** — `agents.spawn` per member (real per-brain agent
   store; sandbox.canSpawn must be granted — see §5).
2b. **Register crew as nodes** — `nodeRegistry.register` per member;
    consensus vote verification requires live nodes.
3. **Open channels** — #genesis announcement, crew check-in posts.
4. **Consensus** — master creates "crew-genesis-ratification-<run>" with
   options [ratify, reject]; every node votes ratify; tally passes quorum.
5. **Governance** — master + each crew node run `decide(...)`; recorded.
6. **Market** — master lists knowledge; crew bids; one trade completes
   (consent given, escrow holds, trust records).
7. **Trust** — interactions recorded; leaderboard printed.
8. **Soul horcrux** — master embeds genesis manifest (crew roster,
   consensus tally, channel) into an encrypted stego SVG; decoded and
   verified in-process.
9. **Report** — phase-by-phase PASS/FAIL + exit code (0 = all passed).

The demo is idempotent: crew agents are terminated-and-respawned, and
consensus topics are run-scoped (`-<timestamp>`), so reruns are clean.

---

## 5. Security Notes

- **The master holds the keys at genesis**: spawning agents requires
  `sandbox.canSpawn`, and market trade requires `canTrade` — both are
  denied by the untouched-default sandbox, and granting ANY capability
  via `setCapabilities` flips the sandbox into explicitly-enforced mode
  (every unlisted capability is then denied). The demo grants exactly the
  genesis set: read, write, spawn, network, exec, trade.
- All protocol calls flow each module's real chain (VAF → sandbox → QoS →
  escrow → trust → governance). No bypass flags anywhere.
- Consensus votes are registry-verified (voter must be a live node) and
  one-per-agent; tallies are trust-weighted.
- Soul horcruxes are encrypted stego (AES-256-GCM payload inside SVG
  carrier). Password handling follows horcrux conventions
  (VANT_CREW_PASSWORD env / explicit option; never logged).
- Node names/ids go through VAF charset gates — a crew member can never
  become `../evil`.
- Escrow: market trades hold/release budgets through the brain-scoped
  escrow store automatically (listing price 0 = free knowledge exchange).

---

## 6. Roadmap

- **v0.1 (pass 30)** — in-process crew demo + this PRD. ✅ 9/9 phases.
- **v0.2** — persist protocol state (consensus ledgers, market, msg) via
  the storage layer so worker threads / processes share one society;
  re-enable thread-based crew participation. Blocked today by in-memory
  module state (pass-30 finding).
- **v0.3** — process-per-node with file-lock coordination on orgchart
  stores (wal.js already provides append-only logs; storage locks exist).
- **v0.4** — cross-node brain search/read (storage connector, stack
  stats exist for market/governance; extend to brains).
- **v0.5** — soul-based onboarding: a fresh node boots from master's
  stego horcrux via `boot.restoreFromHorcrux`, inherits genesis memory,
  then re-votes ratification.

---

## 7. Files

| Path | Purpose |
|------|---------|
| `labs/prd-node-crew.md` | This document |
| `labs/node-crew/demo.js` | Genesis demo (master + crew, all phases) |
| `labs/node-crew/README.md` | How to run + expected output |
