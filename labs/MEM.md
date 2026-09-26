# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 63 — OSS convergence started (labs/prd-oss.md, Wave OSS-A: phantom-endpoint hunt + surface checker 20/20 + SUPPORT/SECURITY doors).
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 63.
**Status:** next per prd-oss.md waves: OSS-B single sources of truth, OSS-C deeper claims registry, OSS-D community depth, OSS-E agent-contributor chapter.
**Owner context:** the crashed "isss" session was a TYPO for OSS (open source software) — owner confirmed. The real scope: convergence and consistency through the frames, backing docs with real endpoints. prd-oss.md is the plan.

---

## CURRENT DUMP

(nothing in flight — pass 63: Wave OSS-A shipped. AGENTS.md phantom
/rpc + brain_agent_* fixed to the real /mcp/exec + agent_* tools;
wrong-repo links retired; SUPPORT.md + SECURITY.md doors; surface
checker in CI. Wave plan A–F of prd-mesh also complete, pushed.)

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
