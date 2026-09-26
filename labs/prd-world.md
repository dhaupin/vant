# The World Layer — Vant as Source of Truth for Synthetic Worlds — PRD

> **Status: SURVEY-PENDING (v0.1).** The import frame is locked; the
> survey of synmergia's working seed/state systems is pending repo
> access (private repo; add `dhaupin/synmergia` to the Freebuff GitHub
> App scope, or drop the PRDs + seed/state files into this workspace).
> Nothing in this document claims to know synmergia's internals yet —
> sections marked SURVEY fill in when the repo is readable.
>
> Owner framing: "Vant is a source of truth model. Look at all this like
> a world-building exercise — the world needs state and interaction."
> Synmergia (Godot MMORPG, the white paper's partner org) has WORKING
> seed and state systems plus PRD design docs to borrow from.
>
> Hosted by Buffy Labs. Companions: [frame.md](frame.md),
> [prd-mesh.md](prd-mesh.md), [whitepaper/README.md](whitepaper/README.md).

---

## 1. The thesis

A world — real or synthetic — is state plus interaction under rules.
Vant already *is* such a world for agents: Ground (durable state),
Bodies (identity), Norms (gates), the Agora (decisions), the Post (the
wire), Workshops (execution), Stewardship (observation). What it lacks
is the vocabulary and primitives of a *synthetic world*: deterministic
derivation from a seed, versioned world-state snapshots, and
state-transition semantics that a second system (a game engine) can
render.

The direction of truth is settled: **vant is the source of truth**;
synmergia (and any other client world) reads world state from vant and
renders it. We do not port synmergia's code; we extract its PROVEN
MODELS, express them in vant's vocabulary, and implement only the
primitives vant's runtime lacks.

## 2. The import frame (how borrowing works between our own projects)

1. **Extract invariants, not code.** GDScript does not transplant into
   Node. Synmergia's seed rules, state machines, and service boundaries
   are surveyed and re-expressed in `labs/` vocabulary. Synmergia keeps
   its implementation; vant owns the canonical model.
2. **Implement only what vant's runtime lacks.** Candidate primitives
   (confirmed/adjusted by the survey): seedable deterministic
   derivation, world-state snapshots with version lineage, guarded
   state transitions (the same gate discipline as everything else).
3. **Close the loop through the mesh.** Synmergia's Godot server is a
   peer node (genesis pair with an org install). World state is not
   borrowed at all — it is SERVED by vant over the signed wire and
   rendered by the game. The white paper's thesis with a game as the
   first real client.

## 3. SURVEY — what to extract from synmergia (the checklist)

When access lands, the survey answers these, with file:line evidence:

- **Seed system (working):** What does a seed DERIVE? (world layout?
  entity spawns? resource distribution?) Deterministic across what
  boundary (process restart? platform? version)? What is the seed's
  TYPE and entropy budget? Is derivation one-shot or incremental?
- **State system (working):** What is a world-state snapshot? (schema,
  versioning, migration story) How are transitions guarded? What is
  authoritative vs simulated client-side? Save/persistence cadence?
- **PRD design docs:** What models did synmergia's docs settle that
  vant should adopt as vocabulary (region/chunk semantics, entity
  lifecycle, time/tick model, ownership of spawned entities)?
- **Service seams:** What does synmergia's server expose that a
  vant-native implementation should mirror (so the game client
  migrates to vant-backed state with minimal client rework)?
- **What stays in synmergia:** rendering, physics, client prediction —
  the game's job, never vant's.

## 4. Wave plan (provisional; survey adjusts)

### Wave W1 — seed determinism (the first primitive)

A `world` module on state-store: `derive(seed, ruleset)` producing a
versioned, reproducible world snapshot; same seed + ruleset version =
same world, provable by pin. Exact semantics inherit from the survey
of synmergia's working system rather than invented here.

### Wave W2 — world state + transitions

Versioned snapshots, transition guards (scope/gate discipline),
lineage for audit (the consensus localOrigin/lastSyncFrom pattern
applied to worlds).

### Wave W3 — the mesh leg

`world.snapshot` pull/push over crew-bus (merge rules decided by the
survey — worlds may be owner-authoritative, unlike ballots), genesis
pairing for the Godot server, mesh-status visibility.

### Wave W4 — synmergia as the first client

The game reads world state from a vant node; the white paper gains its
second real client and the "any shop, any runtime" proof.

## 5. Security notes

- World snapshots are protocol state: kind-marked, state-store only,
  never secrets.
- Seed values may be commercially sensitive (world uniqueness) — treat
  like escrow data: runtime state, not brain content.
- The mesh leg inherits every wire rule: signed envelopes, registered
  peers only, gates run where the state lives.

## 6. Open decisions (owner)

1. Access: add `dhaupin/synmergia` to the Freebuff app scope, or drop
   the PRD/state/seed files into this workspace?
2. Is synmergia's server authoritative-multiplayer already (determines
   whether W3 is read-only serving or read+write)?
3. Name: "world" as the module/frame term — too generic? (alternates:
   realm — retired pass 40, avoid; dominion; terrain — too
   geographic).

## 7. Success criteria

1. Same seed + ruleset version provably derives the same world (pin).
2. A world snapshot survives restart, carries lineage, and respects
   gates (pinned).
3. A peer (the Godot server) can fetch world state over the signed
   wire without custom scripts (pinned live exercise).
4. Synmergia's client renders vant-served state with minimal rework —
   the survey's file:line evidence closes the loop.
