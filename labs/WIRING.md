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
| `mesh.js` (MeshTree) | #164 | WIRED | mesh-status report (pass 171: presence + seed scope) | in-memory only — no persistence; silent (no events); rejected-writes not ledgered |
| `spine.js` (AddressingSpine) | #165 | WIRED | mesh (pass 171); geometry/raid still bypass it | geometry consumers below |
| `cellstore.js` (#150 rebate) | #150 | ORPHAN | none outside spine | RAID + geometry should claim cells here (the dedup savings never fire) |
| `checkpoint.js` (SnapshottedLog) | #151 | ORPHAN | none | mesh deltas are the designed log; nothing snapshots yet |
| `anchor.js` (StateAnchor) | #152 | PARTIAL | brain-verify only (#166 tier) | state-store could anchor root hashes per persist (audit entry carries the hash but no chain exists) |
| `hotset.js` | #153 | ORPHAN | none | hot-path cache for tree reads when a consumer lands |
| `fold.js` (4-ary capacity law) | #149 | ORPHAN | none | structural constraint for a future nested tree; nothing nests yet |
| `delta.js` (DeltaLedger) | #161 | ORPHAN | none | mesh rejected-writes + presence are natural deltas |

## 4. Geometry (`lib/geometry/*`)

| Module | Issue | Status | Debt |
|---|---|---|---|
| `raid.js` | #156 | ORPHAN | should read/write through CellStore + the spine's `/raid/<doc>` space |
| `lattice-keys.js` | #155 | ORPHAN | sha256 PRF exists; imul chain demoted to tested shim — geometry engine still routes neither |
| `precision.js` | #157 | ORPHAN | contract table + quantizer; no caller |
| `fold.js` | #154 | ORPHAN | 1:4 + 24-bit budget; no caller |
| `engine.js` / `fragmenter.js` / `quasicrystal.js` | pre-spine | WIRED (legacy surface) | pre-#165: own key derivation + hashes — the "where the spine got large" answer. Migrating them onto spine/cellstore is the biggest remaining blast radius |

## 5. Targeted repairs (pass 170)

| System | Issue | Status |
|---|---|---|
| `lib/persistent-grants.js` → sandbox `can()` | #162 | WIRED (fail-closed, grantor mandatory, revocation honored) |
| `lib/wal.js` DENIED ≠ EMPTY | #163 | WIRED (pinned) |
| `lib/state/brain-verify.js` verify/anchor/horcrux | #166 | PARTIAL — the tier works; nothing calls `BrainVerifier` on a schedule (horcrux CLI + `vant health` are the natural hosts) |

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
   now fully on the tier). Next: mesh deltas → checkpoint/WAL.
2. **Mesh deltas → checkpoint + WAL** — turns MeshTree from in-memory into
   crash-safe with the primitives that already exist.
3. **Geometry engine → spine/cellstore** — retires the last bespoke key
   derivation and the second hash chain (the #165 thesis, completed).
4. **BrainVerifier onto a schedule** (`vant health` + horcrux CLI).
