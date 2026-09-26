# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 62 — Wave F shipped (`vant mesh status` + Stewardship surface, mesh-status 7/7). Waves A–F ALL SHIPPED — the prd-mesh wave plan is complete.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 62.
**Status:** nothing in flight on the mesh; next per labs/frame.md §5: cross-node settlement (first economic leg), third-org rites, or the noticeboard.
**Owner context:** a prior session ("helping and guiding the isss community") died without leaving any trace in this workspace — no commits, files, or brain notes. Owner asked to resume it; awaiting their recap of what ISSS work was in flight.

---

## CURRENT DUMP

(nothing in flight — pass 62: Wave E+F shipped. Envelope version
stamps w/ cross-version matrix, crew-bus 20/20; vant mesh status
lib+CLI+JSON, mesh-status 7/7; wave plan A–F COMPLETE. Owner mentioned
a crashed session about guiding the ISSS community — no artifacts of
it exist here; do not fabricate, ask the owner.)

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
