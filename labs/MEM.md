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

(nothing in flight — audit criticals ledger complete: 22/23 closed, vaf C1
live-repro'd + fixed (audit.info → vaf's audit(); regression pin in
test/vaf.test.js), test-sandbox stale permissive assertions updated to the
deny-by-default contract. CI 422/0/0. Ledger lives at top of
labs/AUDIT_FINDINGS.md with file:line evidence. Next wave candidates: sync
pullAny/rebase real impls, mcp schema validation enforcement, agents split.
Standing: axolotl horcrux SVG mutates on test runs — leave unstaged;
glob/code_search blind to lib/+test/, use git ls-files/git grep;
node --check multi-arg only checks file 1; str_replace flaky on storage.js — use
the exact-match node-script splice; check `git log -- <path>` before creating files.)

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
