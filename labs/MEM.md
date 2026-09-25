# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** (pre-commit) pass 42 — live-fire round 2, see labs/TASKS.md top block. Pass 41 shipped as bf0edb1 (+ MEM reset 5fb1383); BOTH unpushed on origin/axolotl.
**Branch:** axolotl — origin github.com/dhaupin/vant
**Status:** pass 42 complete and verified; commit pending at session end.

---

## CURRENT DUMP

(nothing in flight — pass 42 live-fire round 2 shipped: crew transport auth
(fail-closed HMAC, replay window, loopback bind), secretless crew nodes
refused, MCP REQUIRE_KEY gate wired into the live server + dead auth-bearing
start() removed (+ Auth-ctor hotfix the live probe caught), config getFlag
null bug, msg participant cap. Pins: test/live-fire-regressions.test.js
26/26. Sweep 117/117 (a,b,c chunk + per-suite; run-all hits the harness's
terminal time cap), runner 37/37. market.list {error} diagnosed as the
pass-38 consent gate (by-design, pinned). Sandbox /tmp/vant-live-r2 is
stale vs lib/ now — re-sync if reused.)

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
- [x] priv brain lessons updated
- [ ] pushed to origin/axolotl
- [x] this file wiped back to template + one-line handoff

— Buffy, agent on the axolotl branch
