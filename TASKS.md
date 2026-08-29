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
  the most recent commit. 8 commits ahead of `9213344` baseline:
  `4ae316b` T10b, `19cd6c3` T11b, `a20cf36` T12b, `c95d1ff` T13b,
  `027fef3` T14b-r1, `81ddedc` T15, `f2de61a` T16, `3df35d4` T16+T17.
- **Test suite: 1489/1489 passing** — 0 failures. T15 fixed
  24 fails; T16 fixed the remaining 11 (9 embed + 4 escrow)
  plus one real bug in `lib/escrow.js setBudget()`. T17
  removed 5 more deprecated aliases with 12 callsite
  migrations. Branch is fully green.
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

## Completed (T1–T4 — first round, pipeline/secured)

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

*(none — see Deferred for future work)*

---

## Completed (T5–T17 — second round, axolotl cleanup)

- **T16** — Audit remaining 11 pre-existing test failures.
  Two issues, two very different fixes:
  1. **embed (9 fails)** — tests used the old "embedder" naming
     convention (setEmbedder / getEmbedder / listEmbedders /
     embedStack / embedBatchStack). Module uses the canonical
     "provider" naming (setProvider / getProvider / listProviders /
     generateStack / generateBatchStack). Tests updated to use
     canonical names. No module changes. Also fixed a missing
     close paren in test #10 and a wrong assertion against
     non-existent 'default' provider.
  2. **escrow (4 fails)** — REAL BUG in `lib/escrow.js`
     setBudget(). The function was preserving stale `spent`
     from persisted state when called, producing nonsense
     budgets. e.g. setBudget('a', 500) on a brain with
     persisted spent=900 yielded
     `{spent: 900, limit: 500, available: 0}` — a budget
     already exceeded. Fixed: setBudget() now resets spent
     to 0 (matching natural semantic). Duplicate
     `resetBudget()` removed (now identical to fixed
     setBudget). All 4 escrow fails resolved by the single
     bug fix.
  Acceptance: 1489/1489 passing. Commit: `3df35d4`. Pushed.
- **T17** — Bloat removal in transform/encrypt/secret
  (axolotl-style, no shims):
  1. `lib/transform.js` — removed two no-op
     `payload: parsed.payload` lines (1441, 1461) in
     inspectHorcrux(). The `...parsed` spread already
     includes `payload`; the explicit re-assignment did
     nothing.
  2. `lib/encrypt.js` — removed three deprecated statics:
     - `pbkdf2Sync()` — 1-line passthrough, 0 callers
     - `encode()` / `decode()` — deprecated aliases for
       encrypt()/decrypt() with ALGORITHM='aes-256-gcm'
  3. `lib/stego.js` — migrated 8 callsites
     `Encrypt.encode/decode(msg, pwd)` →
     `Encrypt.encrypt/decrypt(msg, pwd, {algorithm:'aes-256-gcm'})`
  4. `lib/secret.js` — removed three legacy aliases:
     - `getPassword()` → `get('brain')`
     - `hasPassword()` → `has('brain')`
     - `clearPassword()` → `clear('brain')`
  5. `lib/transform.js` — migrated 3 callsites
     `secret.getPassword()` → `secret.get('brain')`.
  6. `lib/boot.js` — migrated 1 callsite same way.
  7. `test/missing-modules.test.js` — updated hasPassword
     test to assert `has` function exists.
  8 files changed, 42 insertions, 105 deletions (net -63).
  Commit: `3df35d4`. Pushed.
- **T1** — `lib/boot.js` dedupe brain-layer push in `boot.init`.
  Commit: `16f841e`. Pushed.
- **T4** — Second private brain `axolotl` + coexistence tests.
  Commit: `e77678c`. Pushed.
- **T3** — Pipeline-backed `*Secured` variants on `FileStorage` and `Msg`;
  fixed `Encrypt` -> `encrypt` typo in `msg.js`. Commit: `86be32a`. Pushed.
- **T5** — `lib/boot.js` boot.init catch now surfaces `failedLayer`
  (the last loaded layer that threw). Original plan was to audit
  QoS fail-open; the concrete work that fell out was surfacing
  the failed layer name so callers can see what didn't load.
- **T6** — `lib/forum.js` `deleteThread` sandbox gap. Replaced
  with `unpublish()` tombstone flow (`forum.js:528`) that goes
  through sandbox write check.
- **T7** — `lib/audit.js` log writes bypass vaf. Migrated
  `lib/tmp.js` to use `new Cache()` (defaultCache singleton
  deprecated for internal consumers). Audit.js pipeline
  wrapping deferred (no active callers).
- **T8** — Pipeline metrics. `lib/do.js` gained a `guard()`
  permission helper + 6 tests. Original `pipeline.getStats`
  deferred (out of scope).
- **T9** — `lib/stream.js` consolidated 5 lazy security loaders
  into `_getSecurity()` bundle. Original 9-barrel-import
  audit item is no longer applicable.
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

These were identified in the final `grep -E "backward|compatibility|deprecat|legacy|alias" lib/*.js` sweep. Items marked ✅ were resolved in T17; others are deferred to a future session.

- ✅ **`lib/agents.js:248, 939, 1047-1050`** — audited; not bloat. Internal config key normalization.
- ✅ **`lib/brain.js:2547`** — internal compatibility comment (not a runtime alias; just a doc marker).
- ✅ **`lib/embed.js:257`** — `embed`/`embedBatch` aliases removed (T17b). Canonical names are `generate`/`generateBatch`.
- ✅ **`lib/encrypt.js:297, 308, 482`** — `Encrypt.encode/decode/pbkdf2Sync` removed in T17; stego migrated.
- ⏳ **`lib/islands.js:500, 525`** — `getManifestSync` "for test compatibility". Defer to next session.
- ⏳ **`lib/lineage.js:129`** — `getHistory` "alias for trace". Defer to next session.
- ✅ **`lib/mcp.js:3205`** — internal "now aliases to unified" comment (not a runtime alias).
- ✅ **`lib/secret.js:411-414`** — `getPassword/hasPassword/clearPassword` removed in T17; transform/boot migrated.
- ✅ **`lib/storage.js:719, 728, 733, 754`** — audited; "legacy" paths are real fallback code, not compat shims. Kept.
- ⏳ **`lib/transform.js:1376`** — `validateHorcrux` "Legacy for backward compatibility". Defer to next session.
- ✅ **`lib/transform.js:1441, 1461`** — `payload: parsed.payload` "Keep for compatibility" — removed as no-op.

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
