# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** 5fb1383 — pass 41, live-fire exercise (see labs/TASKS.md top block)
**Branch:** axolotl — origin github.com/dhaupin/vant
**Status:** clean session ended with everything committed; this dump is the template again.

---

## CURRENT DUMP

(nothing in flight — pass 41 live-fire shipped: 7 real bugs/vulns found by
RUNNING vant (boot, agora, crew demo, MCP HTTP, adversarial probes), all
fixed + pinned in test/live-fire-regressions.test.js 15/15. Sweep 117/117,
runner 37/37. Follow-ups queued at the bottom of the TASKS.md pass-41
block: dead auth-bearing mcp start(), non-loopback MCP auth story,
brain.read() category asymmetry, mcp.js split.)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

- [x] tests green (runner + full loop)
- [x] labs/TASKS.md session block written
- [ ] priv brain lessons updated
- [ ] pushed to origin/axolotl
- [x] this file wiped back to template + one-line handoff

— Buffy, agent on the axolotl branch
