# Spine Wiring Ledger

> **What this is:** the "list of shit to wire back up" — every state/seed/
> errors/events/audit/WAL surface, whether it's actually consumed by live
> code, and what remains. Maintained per pass; update the Status column
> when you wire something. Created pass 171 (2026-10-08).

---

## Status legend

- **WIRED** — production consumers exist and a pin holds the contract
- **OPT-IN** — wired at the choke point, but no consumer has switched on yet
- **ORPHAN** — shipped, tested, zero consumers outside the spine itself
- **GAP** — the subsystem exists but the wiring point doesn't

---

## 1. Quadrants (pass 169 backbone)

| System | Status | Consumed by | Pins |
|---|---|---|---|
| **ERRORS** — coded VantError everywhere | WIRED | all of lib/ (108 raw throws → 0) | backbone-wiring regression gate (caught a live regression pass 171 — the gate has teeth) |
| **EVENTS** — shared bus lifecycle | WIRED | state-store (`state:saved/hydrated/cleared`, now carrying tree rootHash), wal (`wal:intent/done/replayed/denied`), sidecar, lock, genesis, migrations, metrics, horcrux-safe, habitat | backbone-wiring Q2 |
| **AUDIT** — ledger via the state-store choke point | WIRED | every protocol-state consumer (teams, agents, consensus, market, settlement, org-sync, notices…) inherits it; entries now carry tree rootHash (pass 171) | backbone-wiring Q3 |
| **WAL** — write-ahead journal | WIRED | state-store FileStorage opts in by default (`wal: true`); DENIED ≠ EMPTY pinned (#163) | backbone-wiring Q4, wal suite |

## 2. Locks & paths

| System | Status | Notes |
|---|---|---|
| `lib/lock.pathFor` single lock-path authority | WIRED | `scripts/audit-locks.js` structural gate green; brain-verify's anchor ledger was the last hand-built `.locks` path (fixed pass 170) |
| `lib/anchor.js` (repo-root anchoring) | WIRED | dispatcher env → hosts |

## 3. State spine (`lib/state/*`)

| Module | Issue | Status | Consumers | Debt |
|---|---|---|---|---|
| `canonical.js` | #146 | WIRED | tree, mesh, spine, checkpoint, delta | — |
| `tree.js` (StateTree) | #145/#147/#148 | **WIRED** (pass 172) | state-store tree tier; **four live consumers**: trust (172), node-registry (173), consensus + market (174) — all via persistMerged/persist/hydrate with rootHash on events + audit | next: mesh deltas → checkpoint/WAL; geometry → spine/cellstore |
| `seeds.js` (SeedChain) | #158 | WIRED | spine → mesh (pass 171). Env `VANT_UNIVERSE_SEED` → per-brain config `universeSeed` → fixed default | **RESOLVED (2026-10-08, owner):** fixed default stands — cross-install determinism is the point (mesh is the whole point). `VANT_UNIVERSE_SEED` is the sharding lever; per-brain `universeSeed` stays the durable override (READ path exists; nothing WRITES it yet) |
| `mesh.js` (MeshTree) | #164 | **WIRED-PERSISTENT** (pass 175) | mesh-status report (pass 171, now `{ silent: true }`); pass 175: opt-in `{ dir }` persistence — deltas ride the #151 SnapshottedLog, recovery is snapshot + bounded replay, rejected writes + #161 provenance survive restarts; pass 176: every mutation emits on the shared bus (`mesh:register/heartbeat/aoi/write/write:rejected/recovered`), `{ silent: true }` keeps probes side-effect-free | in-memory by default (unchanged contract) |
| `spine.js` (AddressingSpine) | #165 | **WIRED** (pass 175) | mesh (pass 171); **raid fragmenter cells (pass 175)** | geometry `quasicrystal.js` storage still bypasses it |
| `cellstore.js` (#150 rebate) | #150 | **WIRED** (pass 175) | **raid.fragment({ cellStore })** — shard cells claimed under the spine's /raid/<doc> space; rebate measured by savings_ratio | geometry quasicrystal + world consumers still absent |
| `checkpoint.js` (SnapshottedLog) | #151 | **WIRED** (pass 175) | **MeshTree `{ dir }`** — mesh deltas are the designed log; snapshot + replay recovery pinned in state-wiring | generic WAL/snapshot story for other consumers unproven |
| `anchor.js` (StateAnchor) | #152 | **WIRED** (pass 176) | brain-verify (#166 tier) — `vant health` (brain-integrity section, auto-baselines fresh brains) + `vant horcrux verify` / `vant horcrux anchor` (exit-code contract 0/1/2). Ledger is PER-BRAIN (`<brainDir>/.brain-anchor.jsonl`); brain root EXCLUDES `state/`/`orgchart/` (protocol state has its own integrity story). **Pass 177: state-store tree tier anchors too** — every persist/persistMerged with a tree appends the root hash to a per-brain per-file ledger (`<brainDir>/.state-anchor.jsonl`, carrier = state file); unchanged roots dedupe (in-process + ledger check); `verifyStateRoot(file)` detects on-disk tampering against the last anchor; hydrate NEVER anchors (a restart must not re-bless disk) | — |
| `hotset.js` | #153 | ORPHAN | none | hot-path cache for tree reads when a consumer lands |
| `fold.js` (4-ary capacity law) | #149 | ORPHAN | none | structural constraint for a future nested tree; nothing nests yet |
| `delta.js` (DeltaLedger) | #161 | **WIRED** (pass 175) | **MeshTree provenance** — every register/heartbeat/aoi/write/rejected delta is actor-stamped; deterministic ledgerHash (clock injectable) | other consumers (presence-only feeds) absent |

## 4. Geometry (`lib/geometry/*`)

| Module | Issue | Status | Debt |
|---|---|---|---|
| `raid.js` | #156 | **WIRED** (pass 175) | `fragment({ cellStore })` claims shard cells under `/raid/<doc>` via the spine's ONE PRF; identical shards across docs rebate (#150) |
| `lattice-keys.js` | #155 | **WIRED** (pass 175) | **fragmenter.deriveLatticeKeys delegates to deriveShardKeys** — the last live Math.imul chain in the repo is retired; the legacy shim survives only as the tested lattice-keys export |
| `precision.js` | #157 | ORPHAN | contract table + quantizer; no caller |
| `fold.js` | #154 | ORPHAN | 1:4 + 24-bit budget; no caller |
| `engine.js` / `fragmenter.js` / `quasicrystal.js` | pre-spine | **WIRED** (pass 176) | fragmenter on the #155 PRF (pass 175); **quasicrystal content barcodes on the #146 canonical encoder** (pass 176 — the last un-spined hash chain retired; same logical content → same barcode across key orders/processes). #165 thesis complete: no second hash chain in the repo | engine.js math is compute (julia/node), not state hashing — out of scope by design |

## 5. Targeted repairs (pass 170)

| System | Issue | Status |
|---|---|---|
| `lib/persistent-grants.js` → sandbox `can()` | #162 | WIRED (fail-closed, grantor mandatory, revocation honored) |
| `lib/wal.js` DENIED ≠ EMPTY | #163 | WIRED (pinned) |
| `lib/state/brain-verify.js` verify/anchor/horcrux | #166 | **WIRED (pass 176)** — `vant health` verifies the brain against its anchor (auto-baselines fresh installs); `vant horcrux verify|anchor` expose the CI-safe exit-code contract (0 verified / 1 diverged / 2 no anchor). Per-brain ledger; `state/` excluded from the root |

## 6. Known open husks

- **#122–#144 husk series** — still open (tracked in TASKS; the mass-close
  was pending the spine landing — it has landed).
- **#158 universe decision** — **RESOLVED (2026-10-08, owner):** keep the
  fixed default (cross-install determinism IS the #158 point — mesh is the
  whole point); `VANT_UNIVERSE_SEED` is the opt-in sharding lever;
  per-brain `universeSeed` config stays the durable override once something
  writes it. Nothing depreciates: all content-addressed layers (factHash,
  tree roots, delta ledgerHash, authority hashes) are universe-independent
  by construction; only PRF-derived addressing (region seedScope, cell
  addresses) moves with the constant, and the default never moves.

---

## Where the spine got large (the honest answer)

`lib/state/` is 13 modules and `lib/geometry/` is 12; six of the state
modules and four of the geometry modules are ORPHAN. That is not rot — it
is the engine-parity series landing as primitives before consumers. The
wiring order that pays the most per commit:

1. **One real state-store consumer onto the tree tier** (trust or
   node-registry) — proves the tier, gives anchor/diff a reason to exist.
   ✅ DONE pass 172 (trust) + pass 173 (node-registry, incl. persistMerged
   tree support) + pass 174 (consensus + market — the protocol layer is
   now fully on the tier).
2. **Mesh deltas → checkpoint + WAL** — turns MeshTree from in-memory into
   crash-safe with the primitives that already exist.
   ✅ DONE pass 175 (`MeshTree { dir }` → SnapshottedLog; snapshot+replay
   pinned; rejected writes + #161 provenance durable).
3. **Geometry engine → spine/cellstore** — retires the last bespoke key
   derivation and the second hash chain (the #165 thesis, completed).
   ✅ DONE pass 175 + 176 (fragmenter + GitHub adapter on the #155 PRF;
   raid shards claim CellStore cells under /raid/<doc>; quasicrystal
   content barcodes on the #146 canonical encoder — no second hash
   chain remains).
4. **BrainVerifier onto a schedule** (`vant health` + horcrux CLI).
   ✅ DONE pass 176 (health brain-integrity section + horcrux
   verify/anchor; per-brain anchor ledger; state/ excluded from the
   root so the tripwire only fires on content tampering).
5. **State-store anchors root hashes per persist** (the §3 debt line).
   ✅ DONE pass 177 — tree-tier persist/persistMerged appends the root
   hash to the brain's `.state-anchor.jsonl` (per state file, cause =
   persist path); `verifyStateRoot()` + `lastAnchorFor()` exposed; a
   choke-point bypass (direct file tampering) is now detectable. Also
   pass 177: BrainVerifier.verify() contract fixed to return the anchor
   ENTRY (was a bare hex string while horcrux.js read `.timestamp` off
   it — "Invalid time value" on every successful verify).
