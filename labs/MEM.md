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

(nothing in flight — provider HTTP now routes through network.js
(`31f6f69`, P2 #25 follow-up): GitProvider._requestJson → network.fetch with
`system: true` (sandbox canNetwork gate is LIVE + false-by-default — bare
routing would brick sync; structural pin test guards the bypass through the
canX()/can() migration), `cache: false` (not auth-keyed), SSRF blockers →
NETWORK_BLOCKED, HTTP n → NETWORK_HTTP_ERROR. Loopback-pinned fix: network.js
non-2xx said `HTTP ${res.statusCode}` literally (escaped $). _checkNetwork
fail-open documented, no flip. Remaining audit P-items: atomic writes
everywhere (P2 #27), agents module split (P3 #32). Gotchas: brain.loadCorpus()
returns the warm cache — invalidate before diffing; brain files must be
written via the RESOLVED brain path (models/private/<brain>/, multibrain
layout); corpus ids are extensionless; standalone test suites run via
`node test/x.test.js` and are NOT auto-discovered — ci.js is smoke+syntax,
runner/coverage don't scan test/ (register nothing, follow suite pattern);
stub network.fetch (not global fetch) when testing provider HTTP — network
owns its http/https transport, global-fetch stubs are inert; sandbox final
exports DO expose top-level can() (deny-by-default) though early exports
don't — module load order decides gate liveness. Standing: axolotl horcrux
SVG mutates on test runs — leave unstaged; glob/code_search blind to
lib/+test/, use git ls-files/git grep; node --check multi-arg only checks
file 1; str_replace flaky on storage.js AND mcp.js/brain.js — use the
exact-match node-script splice; check `git log -- <path>` before creating
files.)

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
