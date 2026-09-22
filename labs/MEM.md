# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** see `git log --oneline -3` (TASKS.md latest session block has the verified record)
**Branch:** axolotl — origin github.com/dhaupin/vant
**Status:** clean sessions end with everything committed + pushed; this dump should be the template again.

---

## CURRENT DUMP

(nothing in flight — QC sweep 2 shipped clean at `b05a7a7`: lib-side git
injection closed across branch.js + all 4 connectors via _gitExec/_gitRef
argv-array guards, branch.js audit-not-required crash fixed, commit()
message check relaxed to allowContent (argv-array made metachars inert),
test/git-injection.test.js 7/7 pins it all, labs/QC_WAVE.md rewritten as
the PR #91 go/no-go ledger with verdict GO. All suites / runner 37-37 /
CI 421-0-3 green. Remaining non-blocking: DEAD_EXPORTS pass, cohesion B-2
consolidation, PRD roadmap items. Next up: user decides on merging #91.)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

- [ ] tests green (runner + full loop)
- [ ] labs/TASKS.md session block written
- [ ] priv brain lessons updated
- [ ] pushed to origin/axolotl
- [ ] this file wiped back to template + one-line handoff

— Buffy, agent on the axolotl branch
