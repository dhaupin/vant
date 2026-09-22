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

(nothing in flight — brain-load circuit breaker landed (`5290471`, P3 #34):
consecutive-failure breaker in brain.js over the 3 real load() throw paths
(pipeline-critical crash / options.brain storage error / recursion guard);
coded retryable BRAIN_CIRCUIT_OPEN short-circuit; HALF-OPEN probe after
VANT_BRAIN_CIRCUIT_RESET_MS (default 30s, probing flag stops probe storms);
null misses NEVER feed it; bonus: _metrics.errors was dead telemetry — now
alive; bonus: _clearHandlerOverride() because register() had no undo.
Test gotchas: brain.addMiddleware(mode, name, pos) — first arg is the MODE;
poison a stage via brain.register('sandbox', boom); VANT_MODEL_PATH does
NOT redirect brain paths (_brainModelsRoot is __dirname-relative at load);
no brain.reset() exists. NEXT: labs handoff for #34 was interrupted —
TASKS.md block written but uncommitted, MEM refreshed, then the last audit
items are P3 #33 error-handling standardization and #35 integration tests
for P0/P1 fixes (recommend #35 next — pins the closed criticals
cross-module). Test gotchas: deny-by-default sandbox → suites must
setScopes+setCapabilities before spawn/fork (orgflow pattern); ASYNC
FUNCTIONS RESOLVE error objects, they don't reject — assert resolved
values; bare-identifier pins must strip comments first; error.test.js
harness is sync-only — async checks go through the serialized atest()
chain; circular-dependency WARN lines (vaf↔storage↔sandbox) are
pre-existing + harmless. `lib/primitives.js` is the zero-Vant-requires home
for shared primitives (atomicWriteFile, sleep) — stego/backup STAY on gated
storage.atomicWrite. wal journal file is `wal.log`; structural walk tests
must special-case the helper's own fd write (primitives.js);
brain.loadCorpus() returns the warm cache — invalidate before diffing;
brain files must be written via the RESOLVED brain path
(models/private/<brain>/); corpus ids are extensionless; standalone suites
run via `node test/x.test.js` and are NOT auto-discovered — ci.js is
smoke+syntax, runner/coverage don't scan test/; stub network.fetch (not
global fetch) when testing provider HTTP; sandbox final exports DO expose
top-level can() though early exports don't. Standing: axolotl horcrux SVG
mutates on test runs — leave unstaged; glob/code_search blind to lib/+test/,
use git ls-files/git grep; node --check multi-arg only checks file 1;
str_replace flaky on storage.js AND mcp.js/brain.js — use the exact-match
node-script splice; check `git log -- <path>` before creating files.)

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
