# The World Layer — Vant as Source of Truth for Synthetic Worlds — PRD

> **Status: SURVEY-PENDING (v0.2).** The import frame is locked; the
> survey of synmergia's working seed/state systems runs BACKWARDS
> (owner's call, 2026-09-28): the repo-reading agent fills §3's slots
> in a PR against `axolotl`. Direct repo access is not available from
> this workspace — the Freebuff GitHub App grant is per-repo and its
> scope is not adjustable from here (the installation lists only
> dhaupin/vant). The PR flow needs no grant at all.
> Nothing in this document claims to know synmergia's internals yet —
> the _FILL_ slots in §3 answer when the PR lands.
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

## 3. SURVEY — the intake form (filled by PR from synmergia)

> **How this works (the backwards flow):** the synmergia agent holds
> the repo; this agent holds the vant side. The survey is answered BY
> the repo-reading agent in a PR against `axolotl` — every claim
> carries file:line evidence, the same rule the surface checker
> enforces on docs. Filling rules: answer from CODE, not docs (docs
> drift; code is the truth); one evidence line per claim; write
> `UNSETTLED` where the source repo has not decided yet; write
> `NOT FOUND` where nothing exists — both are real answers, never
> guesses. The vant side fills §3.6 after merge.

### 3.1 Seed system (working — confirm + measure)

| # | Slot | Answer (fill) | Evidence (file:line) |
|---|------|---------------|----------------------|
| 1.1 | What does a seed DERIVE? (world layout? entity spawns? resource distribution? something else?) | _FILL_ | _FILL_ |
| 1.2 | Determinism boundary: same seed ⇒ same world across WHAT? (process restart / platform / engine version / all of these) | _FILL_ | _FILL_ |
| 1.3 | Seed TYPE and entropy budget (string? integer? how many bits of real entropy?) | _FILL_ | _FILL_ |
| 1.4 | Derivation model: one-shot at world genesis, or incremental (per-region/per-chunk on demand)? | _FILL_ | _FILL_ |

### 3.2 State system (working — confirm + measure)

| # | Slot | Answer (fill) | Evidence (file:line) |
|---|------|---------------|----------------------|
| 2.1 | What is a world-state snapshot? (schema shape — top-level fields + one example) | _FILL_ | _FILL_ |
| 2.2 | Versioning + migration story: how does an old save open in a new build? | _FILL_ | _FILL_ |
| 2.3 | Transition guards: what prevents illegal state changes? (validation layer? state machine? trust boundary?) | _FILL_ | _FILL_ |
| 2.4 | Authoritative vs simulated: what does the SERVER own vs what does the client predict? | _FILL_ | _FILL_ |
| 2.5 | Save/persistence cadence (per tick? per event? on interval?) and crash story | _FILL_ | _FILL_ |

### 3.3 Vocabulary (what vant should call things)

| Concept | Synmergia term | Evidence | Adopt into vant as |
|---------|----------------|----------|--------------------|
| World subdivision | _FILL_ (region? chunk? zone?) | _FILL_ | _FILL_ |
| Entity birth/death | _FILL_ | _FILL_ | _FILL_ |
| Time | _FILL_ (tick? frame? epoch?) | _FILL_ | _FILL_ |
| Who owns a spawned entity | _FILL_ | _FILL_ | _FILL_ |

### 3.4 Service seams (what the game server exposes)

| Seam | What it does | Evidence | W3 mirror? |
|------|--------------|----------|------------|
| _FILL_ | _FILL_ | _FILL_ | _FILL_ |

### 3.5 What stays in synmergia (the boundary)

Rendering, physics, client prediction never move to vant — confirm
and list anything ELSE that stays (plus anything surprisingly
server-side worth knowing about):

_FILL_

### 3.6 Intake verdict (vant side, post-merge)

- W1 (`derive`) semantics adjustments: _PENDING SURVEY_
- W3 read-only vs read+write serving (§6 decision 2): _PENDING SURVEY_
- Module name input (§6 decision 3): _PENDING SURVEY_

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

1. Access: RESOLVED (2026-09-28) — the backwards PR flow. The
   repo-reading agent PRs §3's answers against `axolotl`; no repo
   grant is needed on the vant side. (Ground truth recorded:
   `GET /installation/repositories` returns total_count 1 — only
   dhaupin/vant is in the app's scope, and the mobile UI exposes no
   adjustment.)
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
