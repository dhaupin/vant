# Vant axolotl branch — Task Tracking

> Persistent task log for the `axolotl` branch. If a session crashes, a future
> agent can read this file and resume work without losing context.
>
> **Branch:** `axolotl` · **Version:** 0.8.6 (pinned, do not bump) · **Head:** see `git log`
>
> Lessons from completed work live in `models/private/vant/lessons.md` (gitignored,
> per-agent brain). Generic codebase notes also live there.

---

## Current State

- 4 commits ahead of `origin/axolotl` baseline (`9213344`): T1, T4, T3, T2
- All local test suites pass: storage 28/28, msg 17/17, brain 77/77, cache 16/16,
  resolution 12/12, boot 13/13, pipeline 15/15, runner 37/37
- `lib/storage.js` and `lib/msg.js` ship `*Secured` pipeline-backed variants
  alongside the legacy sync API
- `lib/cache.js` and `lib/resolution.js` also ship `*Secured` variants
- Two pre-existing bugs fixed as a side effect of T3 and T2:
  - `msg.js:72` — `Encrypt.key` was undefined (typo); now `encrypt.key`
  - `resolution.js` — `errors` was referenced but never imported

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
