# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 44 — forum decision log durable (state/forum.json); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant
**Status:** pass 44 complete and verified (pins + 2-restart live probe); commit pending at session end.

---

## CURRENT DUMP

(nothing in flight — pass 44 live-fire round 2 continued: forum's decision
feed was memory-only (lost on restart even though the consensus ledger kept
outcomes). Fix: decision records now write through to state/forum.json
(state-store, FIFO-capped at 200) and hydrate at module load, same pattern
as consensus/market (pass 38). clearState() seam added to lib/forum exports.
Pin: test/forum-decisions-persistence.test.js 4/4 (restart simulated via
require-cache eviction of forum+event together — evicting forum alone leaks
the old singleton's vote:consensus listener and double-counts; consensus.create
is lock-wrapped and returns a PROMISE, tests must await it). Market verified
already durable (pass 38) — no change needed. Live: /tmp/p43-probe.js +
/tmp/p44-probe.js chain — decision made in process B, hydrated in process C.
Sweep: agora 7/7, forum 23/23, consensus 8/8, scope 9/9, live-fire 26/26,
market 22/22, runner 37/37.)

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
