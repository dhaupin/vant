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

(nothing in flight — WRAP TRIO SHIPPED: ① CI testBin overhaul (`1d7245c`):
exit-semantics judging replaces any-stdout=pass; SERVER_BINS alive-at-
watchdog=pass; skip status (exit-neutral) for ENV_DENIALS (network bind
denied) + SECURITY_REFUSALS (capability required — deny-by-default
working; clean/snapshot refuse no-arg write ops by design); usage-screen
convention (exit 1 + stdout = pass); stdin 'ignore' so interactive CLIs
(setup.js readline) get EOF instead of watchdog hang; --bin=X filter now
actually filters (outer guard swallowed it). This env: 421/0/3 skipped.
Judge order: error→watchdog(server?)→exit0→ENV_DENIAL→SECURITY_REFUSAL→
usage-screen(stdout+no Error/failed in stderr)→fail. detailLine() extracts
the matching refusal line so stderr noise doesn't drown it. ② Wave retro
(`feac7a0`): labs/WAVE_RETROSPECTIVE.md — commit map for the whole arc,
8 durable lessons, honest residuals (P3 #31, full #33, broader #35,
testBin per-bin pins, AGENTS.md loadCorpus doc drift), metrics table.
③ PR OPENED: https://github.com/dhaupin/vant/pull/91 (axolotl→main, full
wave body; repo praxis is periodic axolotl→main sync PRs #84/#87/#89;
note: axolotl has intentionally divergent history — no merge-base with
main, so keep PRs as whole-branch syncs).
④ MERGE-SAFETY MIGRATION (`3bbacf9`, layout v3): main users have FLAT
brains (models/public root, no stack) — invisible to the axolotl loader
post-merge. New migrations step legacy.multibrain-import nests the flat
brain under --brain-name (default vant), synthesizes state.stack, self-
verifies via corpus; vant start auto-runs migrations (--no-migrate opts
out). Lands in PR #91 automatically. Two subtle bugs worth remembering:
(a) re-calling plan() mid-apply sees the destination dir as a new root
entry → recurses <name>/<name>/ — share ONE plan across passes; (b) brain
module loads (stale, pre-stack 'vant' default) as a side effect of
storage's circular require during the FIRST FileStorage construction —
resync via loadStack([name]) BEFORE switchBrain or the stale default
gets persisted into the migrated stack. Testing gotcha: suite error
strings with embedded newlines truncate under grep — use sed ranges.
Wave trail: #35 integration suite (`ca56f87`, + delegateAsync
stream-gate-swallow fix); #34 brain-load breaker (`5290471` —
BRAIN_CIRCUIT_OPEN, half-open probe, _metrics.errors revived,
_clearHandlerOverride DI); #32 agents split (`3fe53bf`); primitives
(`daa0f51`); #27 atomic writes (`faedaf8`). Probe-methodology notes:
mcp.execute resolves coded-error OBJECTS for input refusals but THROWS for
gate refusals — handle both shapes; sync userCtx guard rejects FALSY only
(typed ctx is RLS, opt-in); vm-jail probe asserts typeof require ===
'undefined' (not a throw — jail swallows to defaults); toHorcrux paths must
be repo-relative (vaf clamps /tmp as traversal BEFORE password check);
child proc (node -e) is the harness for load-time crash regressions.
Earlier in the wave: #34 brain-load breaker (`5290471` —
BRAIN_CIRCUIT_OPEN,
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
