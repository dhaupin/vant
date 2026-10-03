# Vant Axolotl — Wave Retrospective

**Branch:** axolotl · **Date:** 2026-09-22 · **Agent:** Buffy

The audit-to-green arc, end to end: what was broken, what was done about
it, what it cost, what it taught, and what's left.

---

## 1. Where we started

`labs/AUDIT_FINDINGS.md` recorded a full security/reliability audit of the
codebase: **23 criticals** across 8 modules (brain, islands, mcp, storage,
sandbox, vaf, agents, sync/backup/remote/transform), plus 5 systemic
patterns (default-permissive security, path traversal, async/sync races,
stubs, missing validation) and a 35-item prioritized action plan (P0–P3).

The headliners:

- **sandbox.js shipped default-PERMISSIVE** — every capability granted
  unless configured otherwise
- **`vant_call` in mcp.js was arbitrary-require RCE**; ConfigStorage in
  storage.js was require-RCE via crafted config
- **Path traversal** in 12+ write locations (islands, transform restore,
  brain dropbox ops)
- **`delegateAsync`/`pollWork` had zero security** — work items enqueued
  and executed with no gate
- Agents.js was a 3,317-line monolith; brain had TOCTOU windows in its
  load path; sync had crash-on-first-error call sites

---

## 2. The wave, slice by slice

Every slice: scoped from the ledger → tests first (red) → implement
(green) → full loop + CI + runner → one commit → labs records → push.

| Commit | Slice | Ledger item(s) |
|--------|-------|----------------|
| b99065d | **B-2 security-chain consolidation** — brain's ad-hoc security chain delegates to `pipeline.runChain`; one gate order (sandbox→vaf→qos→escrow), canRead/canWrite selected per operation | brain 2, 3 |
| 718558b | **branch-manager tests-first + execFileSync args-array refactor** | (hygiene; no shell-string exec) |
| (audit pass) | **Criticals verification ledger** — all 23 repro-checked; 22 confirmed closed, 1 live bug (vaf C1 loader crash) found and fixed with regression pin | whole ledger |
| faedaf8 | **P2 #27 atomic writes everywhere** — `atomicWriteFile` (hidden same-dir temp → fsync → rename) migrated into the last 9 raw final-path writes (brain bootstrap fallback, qos/gates snapshots, horcrux outputs, WAL blob+compact, format fallback, geometry); structural pins now fail on any new bare `writeFileSync` in lib/ | #27 |
| daa0f51 | **lib/primitives.js** — new zero-Vant-requires home for `atomicWriteFile` + `sleep`; contract enforced by test; error.js compat re-exports; stego/backup deliberately stay on the *gated* `storage.atomicWrite` | (architecture debt from #27) |
| 50e9bae | **error.js latent-bug batch** — 3 live ReferenceErrors fixed (`handle` bare `vaf`/`logger`, `retry` bare `audit`, `circuitBreaker` bare `errors` → breakers could never throw open) + duplicate CODES keys removed; behavioral tests replacing shape-only pins | #33 (partial) |
| 3fe53bf | **P3 #32 agents module split** — 1,156-line monolith → facade + `agents/` (core, work, protos, multibrain, internal); zero consumer changes (Node resolves the dir); emit() listener-error path fixed in the move; 22-check split-contract suite | #32 |
| 5290471 | **P3 #34 brain-load circuit breaker** — OPEN fast-fail with coded `BRAIN_CIRCUIT_OPEN`, half-open probe recovery, `VANT_*` env tuning, `_metrics.errors` revived (was reset-but-never-incremented), `_clearHandlerOverride` DI for tests | #34 |
| ca56f87 | **P3 #35 integration regression suite** — 21 checks walking 23 closed criticals END-TO-END through real entry points (mcp.execute, brain.load, delegateAsync, createIsland, toHorcrux, saveProviderState, storage facade); bonus live fix: delegateAsync swallowed stream-gate denials (phantom `{status:'queued'}` under sandbox deny → now propagates `E_GATE_DENIED` + reverts agent state) | #35, agents 2 |
| c0fb43e | **Cold-clone reincarnation drill** — fresh clone: horcrux inspect valid, restore() rebuilt 18 state items / 0 errors, corpus 63 items async+sync consistent, breaker live, 107/107 module suites | (validation) |
| 1d7245c | **CI testBin overhaul** — exit-semantics judging, skip status for env denials + sandbox-gate refusals, stdin ignore, `--bin` filter fixed | (validation infra) |

### Ledger state after the wave

- **P0 (1–10):** all closed
- **P1 (11–20):** all closed or ledger-annotated as documented residuals
- **P2 (21–30):** closed or annotated (including #27 atomic writes; #26
  Map-confusion documented fail-safe, moved verbatim through the split)
- **P3 (31–35):** closed or annotated (#32 split, #34 breaker, #35
  integration suite shipped; #31 and full #33 documented as residual/next)

The **audit action plan is fully closed or ledger-annotated.**

---

## 3. Verification stack (what "done" means now)

- **Structural pins:** the codebase enforces its own rules — zero raw
  final-path `writeFileSync` in lib/, primitives stays dependency-free,
  agents facade stays thin, split modules keep verbatim behavior
- **Behavioral pins per module:** 107 standalone suites (vs ~30 at wave
  start, many shape-only)
- **Cross-module integration suite:** wires break loudly even when every
  module-local suite stays green
- **CI runner:** deterministic across machines (skip status for
  environment denials and gate refusals — no more machine-dependent
  pass/fail)
- **Cold-clone drill:** the actual disaster-recovery path (horcrux →
  restore → corpus → tests) validated from a fresh clone

Final counts in the dev workspace: CI 421 passed / 0 failed / 3 skipped,
full module loop 107/107, runner 37/37.

---

## 4. What the wave taught (the durable lessons)

1. **Latent bugs cluster in "untestable-looking" code.** The vaf loader
   crash, the error.js ReferenceErrors, and the delegateAsync gate-swallow
   were all invisible because no caller ever exercised the failure paths —
   and they all survived multiple "all green" test runs. Repro-first
   probing beats reading: live `node -e` experiments found all three.
2. **Shape tests (`typeof x === 'function'`) are near-worthless.** They
   pass forever and pin nothing. The error.js batch happened because its
   suite was shape-only; every suite touched since got behavioral tests.
3. **Dependency direction is an architectural decision, not an accident.**
   The brain↔storage↔gate cycle forced primitives.js into existence.
   A zero-Vant-requires tier, enforced structurally, is what keeps
   bootstrap-window code loadable. Every codebase probably needs this tier.
4. **Async functions resolve error objects — they don't reject.**
   `{error:...}` early returns resolve. Tests (and callers!) that assume
   rejection hang forever. Now a standing convention: assert resolved
   values.
5. **Monolith splits are safe only with verbatim moves.** Every function
   body moved character-for-character (requires deepened, `__dirname`
   re-anchored), behavior fixes documented at the site, and the facade
   contract pinned against the pre-split monolith. Zero consumer changes.
6. **Security gates fail in the quietest way possible.** A swallowed gate
   denial looks exactly like success to the caller (`{status:'queued'}`).
   Gate denials must propagate as coded errors — and integration tests
   must walk the *caller's* path, not just the gate's unit path.
7. **CI judging must be environment-deterministic.** "Any stdout = pass"
   made the same binary flip between machines. Exit semantics + explicit
   skip classification (env denial vs gate refusal vs usage screen) makes
   green mean the same thing everywhere.
8. **The drill is the only real proof.** Everything above was "green" in
   the dev workspace the whole time. The cold clone is what validated the
   wave end-to-end — including the reincarnation path the whole product
   exists for.

---

## 5. Residuals & follow-ups (honest list)

- **P3 #31** (evolution island handler) — still a stub, documented
- **P3 #33** (full error-handling standardization) — partially done
  (error.js batch, coded errors in new code); repo-wide sweep remains
- **P3 #35** — integration suite covers the closed criticals; broader
  end-to-end coverage (e.g. full agent lifecycle under sudo) is open
- **sandbox 5** (`canBrain` static defaults) — latent, zero callers,
  ledger-annotated
- **storage 2 / vaf 5 / sandbox 3 / sandbox 4** — "by design" residuals,
  documented in the ledger with their contracts
- **`testBin` usage-screen heuristic** — pass-on-stdout is correct for
  known CLIs but a per-bin expected-output pin list would be stricter
- **AGENTS.md drift** — `loadCorpus()` example implies sync array; the
  async-by-default reality bit us once (drill probe). Doc patch candidate
- **CI runner `warnings` exit code** — warnings still exit 2; consider
  whether skip-status should be surfaced in package.json test scripts

---

## 6. Metrics

| Metric | Start | End |
|--------|-------|-----|
| Open criticals (repro-verified) | 23 | 0 closed-critical regressions; 1 new live bug found + fixed (vaf C1); 1 more found + fixed (delegateAsync swallow) |
| Action plan items | 35 | closed or annotated |
| Standalone test suites | ~30 | 107 |
| CI checks | ~380 | 421 (+3 skips) |
| agents.js | 3,317 lines | facade + 5 focused modules |
| Raw final-path writes in lib/ | 9 | 0 (structurally pinned) |
| Modules with zero-dep tier | none | primitives.js (test-enforced) |

---

*Next agent: pick from §5. The ledger (AUDIT_FINDINGS.md) and TASKS.md
session blocks have the detail. Standing conventions in MEM.md.*
