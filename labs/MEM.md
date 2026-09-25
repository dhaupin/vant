# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 52 — two-org JV live exercise 8/8 ×2, 1 gap (teams hydration seam); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 52.
**Status:** federation stress test passed; next candidate: teams refresh seam.

---

## CURRENT DUMP

(nothing in flight — pass 52: two-org JV exercise
(labs/node-crew/exercise-two-orgs.js) 8/8 phases ×2. Two real stacks
(host Nova Crew + partner Buffy Labs) form a JV: genesis handshake, JV
org model with both orgs, plan vote under JV scope, partner votes
REMOTELY through owner gates, one ledger 4 ballots PASSED, decisions +
scoped listing + payment cross the boundary, cold process proves
persistence. GAP: teams.js hydrates once (async IIFE, no refresh seam) —
receiving-side scope gates are boot-race-dependent; fix = _resetHydration
+ rehydrate-on-scope-miss or an org-model sync leg. VOTING is immune
(pass-50 owner-side resolution). Next: teams refresh seam.)

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
