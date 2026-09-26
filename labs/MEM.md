# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 59 — Wave D shipped (cross-node msg sync + resolvePrincipal live-fire fix + the Commons frame, labs/frame.md; msg-sync 9/9, full mesh regression green); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 59.
**Status:** nothing in flight; next: Wave E (envelope versions) or Wave F (mesh status), or the frame's cross-node settlement gap.

---

## CURRENT DUMP

(nothing in flight — pass 59: Wave D shipped. msg snapshots +
msg.request/msg/msg.push legs, resolvePrincipal precedence fix,
labs/frame.md v0.1 the Commons. Pins: msg-sync 9/9 incl. the
two-process JV standup; sweep green; JV exercise 8/8.)

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
