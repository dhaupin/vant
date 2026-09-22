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

(nothing in flight — P2 #25 provider-op timeouts shipped (`bf11f78`): all 5
git connectors were on BARE global fetch()/execSync (no timeout, no abort,
no circuit breaker) — now GitProvider._requestJson (AbortController → coded
retryable NETWORK_TIMEOUT) + _gitOpts (VANT_GIT_TIMEOUT_MS, default 60s) +
sync._capOp wall-clock caps everywhere (VANT_SYNC_OP_TIMEOUT_MS, default
120s). Remaining audit P-items: atomic writes everywhere (P2 #27), agents
module split (P3 #32). NEXT STEP queued: route connectors through network.js
fetch() for circuit breaker/cache/SSRF-walls (response-shape differs: string
vs Response — github's PR flow asserts on it; also NOTE _checkNetwork()
fail-opens: sandbox canNetwork denial is swallowed by `catch {}` in sync.js —
class of safe-by-default bug, fix alongside). Gotchas: brain.loadCorpus()
returns the warm cache — invalidate before diffing; brain files must be
written via the RESOLVED brain path (models/private/<brain>/, multibrain
layout); corpus ids are extensionless; standalone test suites run via
`node test/x.test.js` and are NOT auto-discovered — ci.js is smoke+syntax,
runner/coverage don't scan test/ (register nothing, follow suite pattern).
Standing: axolotl horcrux SVG mutates on test runs — leave unstaged;
glob/code_search blind to lib/+test/, use git ls-files/git grep; node --check
multi-arg only checks file 1; str_replace flaky on storage.js AND
mcp.js/brain.js — use the exact-match node-script splice; check
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
