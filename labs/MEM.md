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

(nothing in flight — P3 #35 integration regression suite landed (`ca56f87`):
test/integration-criticals.test.js pins all 23 closed criticals END-TO-END
through real entry points (mcp.execute, brain.load, delegateAsync,
createIsland, toHorcrux, saveProviderState, storage facade). AUDIT ACTION
PLAN NOW FULLY CLOSED (P0/P1/P2/P3 all done or annotated). BONUS fix riding
that commit: delegateAsync swallowed stream-gate denials — returned phantom
{status:'queued', workId:undefined} under sandbox deny; now propagates
E_GATE_DENIED + reverts agent state. Probe-methodology notes: mcp.execute
resolves coded-error OBJECTS for input refusals but THROWS for gate
refusals — handle both shapes; sync userCtx guard rejects FALSY only (typed
ctx is RLS, opt-in); vm-jail probe asserts typeof require === 'undefined'
(not a throw — jail swallows to defaults); toHorcrux paths must be
repo-relative (vaf clamps /tmp as traversal BEFORE password check); child
proc (node -e) is the harness for load-time crash regressions.
Earlier in the wave: #34 brain-load breaker (`5290471` — BRAIN_CIRCUIT_OPEN,
half-open probe, _metrics.errors revived, _clearHandlerOverride DI);
#32 agents split (`3fe53bf`); primitives (`daa0f51`); #27 atomic writes
(`faedaf8`). Test gotchas: brain.addMiddleware(mode, name, pos) — first arg
is the MODE, poison via brain.register('sandbox', boom); VANT_MODEL_PATH
does NOT redirect brain paths (root is __dirname-relative at load); no
brain.reset(); deny-by-default sandbox → suites must setScopes+
setCapabilities first; ASYNC FUNCTIONS RESOLVE error objects — assert
resolved values; bare-identifier pins strip comments first; error.test.js
harness is sync-only (async via atest() chain); circular-dep WARN lines are
pre-existing. `lib/primitives.js` = zero-Vant-requires home (atomicWrite
File, sleep); stego/backup STAY on gated storage.atomicWrite. wal journal
file is `wal.log`; structural walk tests special-case the helper's own fd
write (primitives.js); brain.loadCorpus() returns warm cache — invalidate
before diffing; brain files written via RESOLVED brain path
(models/private/<brain>/); corpus ids extensionless; standalone suites via
`node test/x.test.js` NOT auto-discovered; stub network.fetch (not global
fetch) for provider HTTP; sandbox top-level can() vs defaultSandbox.can()
both live. Standing: axolotl horcrux SVG mutates on test runs — leave
unstaged; glob/code_search blind to lib/+test/, use git ls-files/git grep;
node --check multi-arg only checks file 1; str_replace flaky on storage.js
AND mcp.js/brain.js — use the exact-match node-script splice; check
`git log -- <path>` before creating files.)

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
