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

(nothing in flight — agents module split landed (`3fe53bf`, P3 #32):
lib/agents.js now a thin facade over lib/agents/{core,work,protos,multibrain,
internal}.js; export surface pinned identical via pre-split snapshot; ZERO
consumer changes. Bonus fixes in the move: bare `audit.error` in emit()
(4th bare-identifier bug) + _initCache() was dead code (proto-cache
invalidation listeners never registered — now real in protos.js). P2 #26
_messages multiplexing moved verbatim, de-multiplex flagged for later.
Test gotchas: deny-by-default sandbox → suites must setScopes+setCapabilities
before calling spawn/fork (orgflow pattern); ASYNC FUNCTIONS RESOLVE error
objects, they don't reject — assert resolved values; bare-identifier pins
must strip comments first. Remaining audit items: P3 #33 error-handling
standardization, #34 brain-load circuit breaker, #35 integration tests for
P0/P1 fixes. error.test.js harness is sync-only — async checks go through
the appended serialized atest() chain; circular-dependency WARN lines
(vaf↔storage↔sandbox) during tests are pre-existing + harmless.
`lib/primitives.js` is the zero-Vant-requires home for shared primitives
(atomicWriteFile, sleep) — contract enforced by test; stego/backup STAY on
gated storage.atomicWrite. wal journal file is `wal.log` (constants at top
of wal.js); structural walk tests must special-case the helper's own fd
write (in primitives.js); brain.loadCorpus() returns the warm cache —
invalidate before diffing; brain files must be written via the RESOLVED
brain path (models/private/<brain>/, multibrain layout); corpus ids are
extensionless; standalone test suites run via `node test/x.test.js` and are
NOT auto-discovered — ci.js is smoke+syntax, runner/coverage don't scan
test/ (register nothing, follow suite pattern); stub network.fetch (not
global fetch) when testing provider HTTP; sandbox final exports DO expose
top-level can() (deny-by-default) though early exports don't — module load
order decides gate liveness. Standing: axolotl horcrux SVG mutates on test
runs — leave unstaged; glob/code_search blind to lib/+test/, use git
ls-files/git grep; node --check multi-arg only checks file 1; str_replace
flaky on storage.js AND mcp.js/brain.js — use the exact-match node-script
splice; check `git log -- <path>` before creating files.)

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
