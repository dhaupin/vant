# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 65 — THREE-NODE STAR exercise 9/9 (labs/node-crew/exercise-three-nodes.js) + 2 security finds fixed and pinned: consensus read-path scope gate (get/list viewerId), honest webhook acks (dispatched field), registry.refresh seam.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 65.
**Status:** next: synmergia world/state/seed models → Vant world-building frame (owner directive: vant axolotl local distributed mesh is paramount); then OSS waves C-E, mesh gaps (ask-peers, trio genesis).
**Owner context:** "look at this like a world building exercise — the world needs state and interaction"; synmergia (github.com/dhaupin/synmergia, Godot) has deep models/services/states/seed worth porting. Not a human flex — a system built over hundreds of sessions.

---

## CURRENT DUMP

(nothing in flight — pass 65: STAR 9/9. Two security finds fixed:
consensus get/list had NO scope gate (a non-member hub could read a
scoped JV ledger — fixed with viewerId semantics, pinned 9/9 in
test/consensus-read-scope.test.js); webhook acks reported subscriber
count as handlers, making silent refusal look like delivery (fixed
with honest dispatched field). Registry refresh seam added. Next:
synmergia model extraction.)

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
