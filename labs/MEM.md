# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 65 — THREE-NODE STAR exercise 9/9 (labs/node-crew/exercise-three-nodes.js) + 2 security finds fixed and pinned: consensus read-path scope gate (get/list viewerId), honest webhook acks (dispatched field), registry.refresh seam.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 65.
**Status:** BLOCKED on synmergia access for the survey; meanwhile OSS waves C-E and mesh gaps (ask-peers, trio genesis) are unblocked work.
**Owner context:** "vant is a source of truth model; world-building exercise; the world needs state and interaction." Synmergia (Godot MMORPG) has WORKING seed + state systems + PRD design docs to borrow. labs/prd-world.md v0.1 written (survey-pending) — import frame locked: extract invariants not code, implement only what vant lacks, close the loop through the mesh (Godot server = peer node; vant SERVES world state).
**BLOCKER:** dhaupin/synmergia is private, NOT in the Freebuff GitHub App scope (clone/gh/search all fail; no public repo by that name exists). Owner must add it to the app's repo scope, or paste the PRDs + seed/state files.

---

## CURRENT DUMP

(waiting on synmergia access. When it lands: survey per
prd-world.md §3 checklist — seed derivation semantics, state snapshot
schema/versioning, PRD vocabulary, service seams — with file:line
evidence, then fill W1-W4 in and implement Wave W1. Meanwhile OSS
waves C-E + mesh ask-peers leg are unblocked.)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

1. Update `labs/TASKS.md` — new top session block (what shipped, next steps)
2. Write brain learnings (models/private/buffy/)
3. Update this file — wipe CURRENT DUMP to "(nothing in flight)", set Handoff
4. Commit: `axolotl: pass NN — <one-liner>`
