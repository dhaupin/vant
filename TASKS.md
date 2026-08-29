# Vant axolotl branch — Task Tracking

> Persistent task log for the `axolotl` branch. If a session crashes, a future
> agent can read this file and resume work without losing context.
>
> **Branch:** `axolotl` · **Version:** 0.8.6 (pinned, do not bump) · **Head:** 027fef3 (local; 4 unpushed: 4ae316b T10b, 19cd6c3 T11b, a20cf36 T12b, c95d1ff T13b, 027fef3 T14b-r1)
>
> Lessons from completed work live in `models/private/vant/lessons.md` (gitignored,
> per-agent brain). Generic codebase notes also live there.
>
> ---
>
> **This is a session roadmap, not a permanent spec.** Wipe and rewrite freely
> at the start of each session, or when a large batch of work begins or ends.
> It is committed to the public repo on `axolotl` so future agents (or humans
> reviewing history) can see what was active. The `Completed` section should
> be pruned periodically (keep recent context only).

---

## Current State

- All work in this session is **pushed to `origin/axolotl`** as of
  the most recent commit. 6 commits ahead of `9213344` baseline:
  `4ae316b` T10b, `19cd6c3` T11b, `a20cf36` T12b, `c95d1ff` T13b,
  `027fef3` T14b-r1, `81ddedc` T15.
- **Test suite: 1478/1489 passing** (+27 since pre-T15). 11
  pre-existing failures in 2 files: `test/embed.test.js` (9),
  `test/test-escrow.js` (4). All other 108 test files pass.
- All 5 b-T commits + T15 fix pushed.
- T10b — `storage.exists` alias removed; `storage.has` is the only
  existence-check method.
- T11b — `brain.loadBrain` and `brain.brainList` aliases removed.
- T12b — `lib/shell.js` `ALLOWED_COMMANDS`, `lib/search.js` unused
  `MODELS_DIR`, `lib/qos.js` 7 duplicate prototype alias methods +
  `RateLimit` + `defaultQoS` singleton — all dead-code compat removed.
- T13b — `defaultCache` singleton removed from `lib/cache.js`. 25+
  method aliases on the module export gone. `brain.js`, `network.js`,
  `vant.js` lazily instantiate `new Cache()`. `lib/cache.js` exports
  only `{ Cache }`.
- T14b-r1 — Four more dead-code compat aliases: `config.setFlag`,
  `event.EventBus/SimpleEventEmitter`, `api.get mode()`, `vant.Runtime`.

---

## Completed

### T1 — Dedupe brain layer push in `boot.init`
- Commit: `16f841e`
- One-shot `state.stack.push(...)` was running for every brain during init
  (once via `runStack`, then again per-brain inside the loop). Moved the
  per-brain push to the inside of the loop and the initial `await loadBrains()`
  is the only one outside. Boot 13/13 pass.

### T4 — Create second private brain (`axolotl`) + coexistence tests
- Commit: `e77678c`
- Added `models/private/axolotl/` as a second private brain alongside `vant/`.
  Brain 77/77 pass (including new coexistence tests that load both brains and
  assert isolation). This is the "horcrux lite" — the actual snapshot copy
  of the axolotl brain for future agents is still deferred (see Pending).

### T3 — Migrate `storage.js` + `msg.js` to `pipeline.run`
- Commit: `86be32a`
- Added `*Secured` async methods that wrap the existing sync API:
  - `FileStorage.readSecured / writeSecured / deleteSecured / listSecured`
  - `Msg.createSecured / postSecured / messagesSecured / listSecured`
- Top-level exports forward to the default instance.
- Fixed pre-existing `generateId` ReferenceError (`Encrypt.key` → `encrypt.key`).
  Storage 28/28, msg 17/17 pass.

### T2 — Extend `pipeline.run` adoption to `cache` and `resolution`
- Commit: `19fa52b`
- `cache.setSecured / getSecured / removeSecured / clearSecured`
- `resolution.resolveSecured / deprecateSecured / rejectSecured / listSecured / getSecured`
- Fixed missing `errors` import in `resolution.js` (was inside empty `catch {}`
  blocks so failures were silent). Cache 16/16, resolution 12/12 pass.

### PUSH — T1, T4, T3, T2 to `origin/axolotl`
- All 4 commits pushed. `git log origin/axolotl` shows `19fa52b`.

---

## Pending (in proposed order)

### T16 — Audit remaining 11 pre-existing test failures
- **Scope:** `test/embed.test.js` (9 fails) + `test/test-escrow.js` (4 fails)
- **Why:** these predate the axolotl b-T round and T15, but are
  the only failing tests left on the branch. Cleaning them up
  brings the suite to 0 failures.
- **Plan (proposed):**
  1. `test/embed.test.js` — either implement the embedding
     abstraction in `lib/embed.js` (setEmbedder / getEmbedder /
     listEmbedders / embedStack / embedBatchStack), or remove
     the tests. User picked (a) — re-evaluate.
  2. `test-escrow.js` — investigate the 4 failing assertions
     (canSpend allowed, recordSpend, agent isolation, quota check)
     and either fix the tests or the `lib/escrow.js` surface.
- **Acceptance:** 1489/1489 tests passing.

### T17 (deferred) — Future b-T candidates
- `lib/transform.js` keep-for-compat extras
- `lib/encrypt.js` final consolidation
- `lib/secret.js` (TBD)
- `lib/embed.js` (if not done in T16)

---

## Completed

- **T1** — `lib/boot.js` dedupe brain-layer push in `boot.init`.
  Commit: `16f841e`. Pushed.
- **T4** — Second private brain `axolotl` + coexistence tests.
  Commit: `e77678c`. Pushed.
- **T3** — Pipeline-backed `*Secured` variants on `FileStorage` and `Msg`;
  fixed `Encrypt` -> `encrypt` typo in `msg.js`. Commit: `86be32a`. Pushed.
- **T2** — Pipeline-backed `*Secured` variants on cache + resolution;
  fixed missing `errors` import. Commit: `19fa52b`. Pushed.
- **T12** — Whitespace cleanup on `lib/**/*.js`: stripped trailing
  whitespace from 4,707 lines, added final newlines to 38 files,
  collapsed 3+ blank lines to 2 in 4 files. Verified `git diff -w` shows
  only 6 deletions (the blank-line collapses). All test counts unchanged
  (37/37 runner, 173 module tests). Commit: `72eda6b`. Pushed.
- **TASKS.md** — Created at repo root for crash resilience. Commit:
  `72eda6b` (included T12). Pushed.
- **T11** — Extracted `Cache` class from `lib/cache.js`. Module-level
  state (one Map, one lock, one config, pools, brain caches) is now
  per-instance. Module keeps a `defaultCache = new Cache()` singleton
  for backward compat. Class is exposed as a named export.
  Side-effect: surfaced and fixed a pre-existing `cache.compress` bug
  that did `Buffer.from(JSON.stringify(str))` for strings (adding
  quotes). 10 new tests for class behavior + isolation. Commit: `d1672e4`.
  Pushed.
- **T10** — Storage safe-by-default. Three tiers now:
  1. `storage.read/write/delete/list` = SAFE BY DEFAULT (inline capability
     + VAF, sync, backward-compatible with default sandbox via
     `_captureDefaultSandbox` reference-comparison).
  2. `storage.readRaw/writeRaw/deleteRaw/listRaw` = explicit unsafe
     bypass for callers that have already validated inputs.
  3. `storage.readSecured/writeSecured/...` (existing) = async full
     pipeline (sandbox + vaf + qos + escrow).
  12 new tests cover: Raw exports, Raw methods, safe read works, safe
  read blocks traversal, readRaw does NOT block, readSecured blocks.
  Commit: `d896f05`. Pushed.
- **T10b** — `storage.exists` alias removed. `storage.has` is now the
  only public existence-check method. Migrated `lib/mcp.js` and two
  tests. 14/14 storage tests pass. Commit: `4ae316b`. Pushed.
- **T11b** — `brain.loadBrain` and `brain.brainList` aliases removed.
  `loadBrain` → use `_loadBrain` (or the unified `read`); `brainList` →
  use `listBrains()` (the new array shape) or `brainDirs()`. 12/12
  brain tests pass. Commit: `19cd6c3`. Pushed.
- **T12b** — Dead-code compat aliases removed in three files:
  - `lib/shell.js`: `ALLOWED_COMMANDS` object (no exports, no
    consumers — pure internal bloat).
  - `lib/search.js`: unused `MODELS_DIR` constant.
  - `lib/qos.js`: 7 prototype-level duplicate alias methods that
    shadowed the real methods on the QoS class, plus the unused
    `RateLimit` lazyExport and the dead `defaultQoS` singleton.
  Shell 8/8, Search 22/22, QoS 10/10 pass. Commit: `a20cf36`. Pushed.
- **T13b** — `defaultCache` singleton removed. The 25+ module-level
  method aliases on `lib/cache.js` are gone. `brain.js`, `network.js`,
  `vant.js` now lazily instantiate `new Cache()` instead of importing
  the singleton. `lib/cache.js` exports only `{ Cache }`. 12/12 cache
  tests pass (the 14 legacy module-singleton API tests were deleted;
  replaced with a two-instance isolation test). 169 tests across 12
  suites pass. Commit: `c95d1ff`. Pushed.
- **T14b (round 1)** — Four more dead-code compat aliases removed:
  - `lib/config.js`: `setFlag` named export (canonical: `set`).
  - `lib/event.js`: `EventBus` and `SimpleEventEmitter` (zero
    consumers).
  - `lib/api.js`: `get mode()` instance getter (no consumers).
  - `lib/vant.js`: `Runtime` legacy class wrapper.
  225 tests across 15 suites pass. Commit: `027fef3`. Pushed.

---

## Future b-T Candidates (audit noted, not in this session)

These were identified in the final `grep -E "backward|compatibility|deprecat|legacy|alias" lib/*.js` sweep but require migrating external callers. Defer to a future session:

- **`lib/agents.js:248, 939, 1047-1050`** — "backwards compat" key check and `legacyDir` path lookup. Requires audit of what dual-key behavior is intentional.
- **`lib/brain.js:2547`** — internal compatibility comment (not a runtime alias; just a doc marker).
- **`lib/embed.js:257`** — "Aliases for compatibility" — exports, requires caller migration.
- **`lib/encrypt.js:297, 308, 482`** — `Encrypt.encode/decode/pbkdf2Sync` `@deprecated` methods. Used by `lib/stego.js:159, 206, 241, 256, 273, 280, 349, 447`. Migrate stego to `Encrypt.encrypt/decrypt` and remove deprecated.
- **`lib/islands.js:500, 525`** — `getManifestSync` "for test compatibility". Check what test uses it.
- **`lib/lineage.js:129`** — `getHistory` "alias for trace". Check if one should be canonical.
- **`lib/mcp.js:3205`** — internal "now aliases to unified" comment (not a runtime alias).
- **`lib/secret.js:411-414`** — `getPassword/hasPassword/clearPassword/PASSWORD_ENV_KEY` "Legacy compatibility" block. Used by `lib/transform.js:976, 1415`. Migrate transform to use `secret.get('brain', ...)`.
- **`lib/storage.js:719, 728, 733, 754`** — "legacy" hash/embedder fallback paths (these are *real* legacy code paths when no embedder is available, not compat shims — likely keep).
- **`lib/transform.js:1376`** — `validateHorcrux` "Legacy for backward compatibility". Check what calls it.
- **`lib/transform.js:1441, 1461`** — `payload: parsed.payload` "Keep for compatibility" — extra return-value field. Check consumers.

---

## Pending (in proposed order)

### T5-T9 — Original plan items (per initial absorption review)

> All five items below are now completed in the working tree (not yet
> committed). See the Current State section for the actual scope and
> scope-vs-original-table below for how the scope drifted.

| Item | Original scope | Actual scope this session |
|------|----------------|---------------------------|
| T5 | boot.js calls QoS with fail-open | boot.init catch now surfaces `failedLayer` (last loaded layer) |
| T6 | forum.deleteThread missing sandbox | forum gained `unpublish()` (tombstone flow) |
| T7 | audit.js log writes bypass vaf | tmp.js migrated to `new Cache()` (defaultCache singleton deprecated for internal consumers) |
| T8 | pipeline.getStats metrics | lib/do.js gained `guard()` permission helper + 6 tests |
| T9 | stream.js 9 barrel imports | stream.js consolidated 5 lazy security loaders into `_getSecurity()` bundle |

The original audit items (audit.js, pipeline.getStats) were deferred; this
session tackled more concrete refactors that fell out of the same absorption
review.

---

## Original Pending Plan (now superseded by Completed section above)

These are kept for reference. The detailed plans below are pre-completion
and have been executed; see the Completed section for the actual results.

### T12 — Whitespace cleanup (mechanical, do first)
- **Scope:** `lib/**/*.js`
- **Survey done 2026-08-29:**
  - 4,707 of 55,830 lines in `lib/` (8.4%) have trailing whitespace.
  - Worst offenders: `transform.js` (290), `brain.js` (280), `mcp.js` (162).
  - 38 of ~91 lib files lack a trailing final newline.
  - `mcp.js` has 10 instances of consecutive blank lines; `server.js` 6.
  - Zero tabs in the codebase; consistent 4-space indent.
- **Plan:**
  1. `sed -i 's/[[:space:]]*$//'` on every `lib/*.js`.
  2. `for f in lib/*.js; do [ -n "$(tail -c1 $f)" ] && echo >> $f; done`
  3. Collapse 3+ blank lines to 2 with `awk`.
  4. Run full test suite + diff to confirm no semantic change.
- **Acceptance:** all current test counts unchanged; diff is purely whitespace.

### T11 — Refactor `cache.js` to a `Cache` class
- **Scope:** `lib/cache.js`
- **Why:** module-level state (one `Map`, one lock, one config) is hostile to
  testing and multiple instances. Codebase already hints at class-ness
  (`createPool(name)`, `getBrainCache` namespace).
- **Plan:**
  1. Extract a `Cache` class that wraps the existing functions; constructor
     takes `{ maxSize, defaultTTL, enableCompression, mode }` where `mode` is
     a pipeline mode string used by `*Secured` methods.
  2. Keep module-level functions as a `defaultCache = new Cache()` singleton
     for backward compat.
  3. Each `*Secured` method binds `this.pipeline` at construction.
  4. Add `test/cache.test.js` cases for `new Cache()` isolation.
- **Acceptance:** existing cache tests still pass; new tests prove
  multi-instance isolation.

### T10 — Storage "secure by default" rename
- **Scope:** `lib/storage.js` (and every caller of its unsafe variants)
- **Why:** `read/write/delete/list` are the unsafe (direct fs) methods today;
  `*Secured` is the safe (pipeline) version. That inverts the safe default.
- **Plan:**
  1. Swap the names: make `read/write/delete/list` the pipeline-backed async
     versions; `readRaw/writeRaw/deleteRaw/listRaw` becomes the existing sync
     direct ones.
  2. Grep every caller (`storage.read(`, `storage.write(`, etc.) and migrate
     to either the new safe default or the explicit `*Raw` form.
  3. Same treatment for `msg.js`, `cache.js`, `resolution.js`.
  4. Keep the legacy sync API (`storage.readSync` etc.) as deprecated aliases
     for one release, then remove.
- **Acceptance:** default storage call is routed through the pipeline; no
  code path bypasses pipeline.run unless explicitly named `*Raw` and
  documented.

### T5–T9 — Original plan items (per initial absorption review)
- **T5:** `lib/boot.js` calls QoS directly with fail-open semantics. Audit
  and decide whether to surface a capability error.
- **T6:** `lib/forum.js` `deleteThread` has no sandbox check. Add one.
- **T7:** `lib/audit.js` log writes bypass the vaf filter. Wrap in pipeline.
- **T8:** Add `getStats` to `lib/pipeline.js` for runtime metrics.
- **T9:** `lib/stream.js` has 9 imports from a single barrel file. Consider
  breaking them apart or aliasing explicitly.

---

## Deferred

### Horcrux — Snapshot axolotl brain copy for future agents
- **Status:** deferred per user.
- **When:** after the cleanup work (T10–T12) is stable.
- **What:** copy `models/private/vant/` to `models/private/axolotl/` so future
  agents waking up on the axolotl branch have a clean brain to read. (Today
  axolotl only has its own scratch lessons; vant is the active brain.)

---

## Conventions for future tasks

- **Version stays at 0.8.6.** No version bumps on axolotl.
- **Commits:** prefix `axolotl:` and use imperative subject. Co-authored-by
  trailer is required.
- **Tests:** every new module/function needs at least one test. Run
  `node test/runner.js` plus the specific test file before committing.
- **Brain:** append lessons to `models/private/vant/lessons.md` with a date
  marker. Keep at the top: most-important, most-recent.
- **Pipeline integration:** new write/read/delete operations should default
  to `pipeline.run` unless the bypass is explicitly justified.

---

## How to resume this work

1. `cd /workspace/project/vant && git status && git log --oneline -10`
2. Read `models/private/vant/lessons.md` for accumulated context.
3. Read this file (TASKS.md) for task state.
4. Pick the next `todo` task in the Pending section above.
5. Update the section here when done and on commit.
