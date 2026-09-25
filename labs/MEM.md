# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 53 — teams refresh seam (pass-52 gap closed, JV exercise 8/8 with 0 gaps); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 53.
**Status:** nothing in flight; backlog: org-model sync leg, agora-sync MCP surface, TTL reaper, gossip pulls.

---

## CURRENT DUMP

(nothing in flight — pass 53: teams refresh seam shipped (merge-only
_hydrateTeams + throttled refresh/_refreshSync + _resetHydration, all
exported); scope.resolveMembers rescues a stale view on miss (throttled
sync refresh + retry, fail-closed preserved). teams+escrow store paths
now go through state-store.currentBrain() so VANT_BRAIN-scoped processes
keep org model + budgets WITH their protocol state. Pins:
test/teams-refresh.test.js 6/6. JV exercise re-validated: 8/8, 0 gaps.)

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
