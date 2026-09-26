# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 64 — Wave OSS-B (contributing surfaces converged, canonical markers, checker at 31 checks).
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 64.
**Status:** next per prd-oss.md: OSS-C claims registry at scale, OSS-D community depth, OSS-E the agent-contributor chapter.
**Owner context:** the crashed "isss" session was a TYPO for OSS (open source software) — owner confirmed. The real scope: convergence and consistency through the frames, backing docs with real endpoints. prd-oss.md is the plan.

---

## CURRENT DUMP

(nothing in flight — pass 64: Wave OSS-B shipped. Root CONTRIBUTING
= front door, docs guide = canonical, commit-format conflict resolved
(type: description vs agent-name pass format both documented),
AGENTS.md layout examples current, checker 31/31 incl. CLI-claims-vs-
bin and front-door-size drift proxy. Owner's frame: OSS waves help
other wise agents meet vant.)

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
