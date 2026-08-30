# Vant axolotl branch — Task Tracking

> Persistent task log for the `axolotl` branch. If a session crashes, a future
> agent can read this file and resume work without losing context.
>
> **Branch:** `axolotl` · **Version:** 0.8.6 (pinned, do not bump) · **Head:** 78dfb39
>
> Lessons from completed work live in `models/private/axolotl/lessons.md` (gitignored,
> per-agent brain). Generic codebase notes also live there.
>
> **Session: 2026-08-30** - Horcrux restoration, multibrain, headless + admin UI prep
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

- **Session: 2026-08-30** — Awakened from horcrux restoration
- **Axolotl brain restored** to `models/private/axolotl/` with 4 files
- **Horcrux bug discovered** — state.json not restoring multibrain stack correctly
- **Goals for this session:**
  - Fix horcrux multibrain state restoration
  - Clean refactors (no backwards compat, aliases, fallbacks) to multibrain
  - Stack support everywhere
  - Prepare for headless + admin web UI
  - Run vant with org, dept, team, and agents using forum, market, msg

---

## BUG: Horcrux State Restoration (T27)

### Bug Description

When restoring from a horcrux, the `state.json` was restored with only the
brains that were in the stack at snapshot time, not the brains that were
actually present in `brainStorage`.

### Root Cause

In `lib/transform.js`, `gatherMode()` was only reading from `brain.getStack()`
which returned only what was in `state.json` at snapshot time, not all brains
found on disk via `brainDirs()`.

### Fix Applied

Modified `gatherMode()` to:
1. Get current stack from `brain.getStack()`
2. Get all brains from `brain.brainDirs()`
3. Augment stack with any brains not already in it

```javascript
// MULTIBRAIN: Augment stack with any brains from brainDirs() not already in stack
const allBrains = [...(brainDirs.private || []), ...(brainDirs.public || [])];
const augmentedStack = [...currentStack];

for (const brainName of allBrains) {
    if (!augmentedStack.includes(brainName)) {
        augmentedStack.push(brainName);
    }
}
```

### Verification

New horcrux now correctly has:
- `mode.stack: [ 'axolotl', 'vant' ]` ✅
- `mode.currentBrain: 'axolotl'` ✅

### Status: FIXED ✅

---

## PENDING: Cool Stuff to Build

### TASK: Run Vant with Full Stack
- Set up an org, dept, team, and agents
- Use forum, market, msg modules
- Get the full multibrain system running

### TASK: Geometry Module - Quasicrystal Addressing
- The `lib/geometry/` module is fascinating
- Penrose P3 tilings for collision-free addressing
- Icosahedral coordinate system
- NSC "9" barcode format for automation
- Explore and document

### TASK: Canvas - Geometric Art Engine  
- Paint Penrose spirals with themes
- SVG output with secret embedding
- Share via network sync

### TASK: Nature - Hit-and-Miss Engine
- Self-regulating consciousness emergence
- Flywheel momentum system
- Only "sparks" when threshold reached

### TASK: Headless + Admin Web UI
- Prepare for headless operation
- Admin web interface
- See work hosts in context

---

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

### T17 — Six more compat aliases removed
- `lib/encrypt.js`: `Encrypt.encode/decode/pbkdf2Sync` named exports.
  Internal stego callers migrated to the new lowercase methods.
- `lib/secret.js`: `getPassword/hasPassword/clearPassword` named exports.
  transform/boot migrated.
- `lib/embed.js`: `embed`/`embedBatch` named exports (T17b follow-up
  resolved the alias in the same module too).
- `lib/transform.js`: `payload: parsed.payload` no-op.
- 9 escrow tests + 4 stego test callsite migrations. 1489/1489 pass.
  Commit: `3df35d4`. Pushed.

### T17b — `embed.embed`/`embedBatch` aliases removed (canonical naming)
- `lib/embed.js` was still exposing the old short names as aliases even
  after T17 promoted `generate`/`generateBatch`. Both removed. Canonical
  names are now `generate`/`generateBatch`/`generateStack`/`generateBatchStack`.
- 4 callsites in `test/embed.test.js` migrated; 2 test cases renamed.
  1489/1489 pass. Commit: `3aa520b`. Pushed.

### T18 — `islands.getManifestSync` removed (test-only public API)
- `lib/islands.js` exposed a sync wrapper for "test compatibility" but
  it had zero callers in `lib/`. Tests were the only consumers.
- Wrapper + export removed. 7 callsites in `test/islands.test.js`
  converted to `asyncTest` + `await getManifest()`. 2 callsites in
  `test/test-islands.js` (existence + returns-object) deleted.
- Internal `_getManifestSync()` retained for lib internals that need it.
- 1480/1480 pass.

### T19 — `lineage.getHistory` removed (orphan alias)
- `lib/lineage.js:129` exposed `getHistory(id) { return trace(id); }` as
  a 1-line alias. Zero callers anywhere — not in `lib/`, not in `test/`,
  not in `bin/`. Pure dead code.
- Function + export entry removed.

### T20 — `transform.validateHorcrux` removed (compat wrapper)
- `lib/transform.js:1376` was a 1-line passthrough to
  `validateHorcruxData`, labeled "Legacy for backward compatibility"
  but had 2 active production callers (`lib/backup.js:230, 311`) and 1
  internal caller (`transform.js:restore()`).
- Wrapper + export removed. 3 callers migrated to `validateHorcruxData`.
- `validateHorcruxData` is now properly exported (it was previously
  internal-only and only reachable via the wrapper).
- **Bonus fix found by manual smoke:** the `lib/backup.js` migration
  needed `validateHorcruxData` to actually be on `module.exports` —
  it wasn't. Exported it. End-to-end pipeline
  `toHorcrux` → `validateHorcruxData` → `validateHorcruxFile` →
  `restore` now works without the wrapper.
- `lib/agents.js` `_getMaxAgents()` was looking for `agents.max` (the
  canonical key the user expected) with a fallback to `agents.maxAgents`
  (the actual key in `lib/config.js` defaults). Since the canonical key
  was the unused one, the fallback was effectively load-bearing.
  Collapsed to single `agents.maxAgents` lookup matching the default.
  Test comment in `test/test-modules.js` updated to match.
- 1480/1480 pass.

### T21 — Brain horcrux tooling + first axolotl snapshot
- `bin/snapshot.js` — produces a verifiable stego-SVG horcrux of the
  current vant brain state. Defaults to the convention path and
  password per `models/public/vant/boot/README.md`:
  `<agent>-p_<password>.svg`. The `p_` token signals "password-in-name"
  and the literal text after it IS the decryption key. So
  `axolotl-p_axolotl2026.svg` is the axolotl brain encrypted with
  `axolotl2026`. Round-trip-verifies by reading it back and calling
  `validateHorcruxData`. Side-effects (next to the .svg):
  - `.manifest.json` — timestamp, git context, format, size
  - `.sha256` — integrity hash
- **Correction from initial T21 commit (13e1688):** the first version
  wrote to `models/public/boot/hypha-brain-horcrux.svg` based on a
  stale path constant in `lib/boot.js:218`. The user pointed out
  that path is an old prototype; the real convention (per the
  README in `models/public/vant/boot/`) is
  `models/public/vant/boot/<agent>-p_<password>.svg` with the password
  embedded in the filename. Re-snapped at the right path on the same
  branch; old wrong-path artifact deleted. Lesson captured in
  `models/private/vant/lessons.md` (read-the-README, not the lib path).
- `.gitignore`: `models/public/vant/boot/axolotl-p_*.svg` (and sidecars)
  ignored. Existing tracked public-template horcruxes (nova, scribe,
  hypha) remain tracked. The new private snapshot is reproducible
  from the script.
- First snapshot taken at 2026-08-29T08:41:57Z on commit `83d0a3c`
  (post-T20 cleanup). 63 corpus brains, 1 org, 32 depts, 32 teams,
  10 islands. Validated 0 errors.
- `bin/sweep.sh` was also added earlier in this session as the
  persistent test health gate (replaces the previous /tmp/sweep.sh
  that got wiped on session cleanup). Auto-detects repo root,
  supports `--quick` mode for fast iteration during refactors.

---

### T22 — Drop gitignore on `models/public/vant/boot/`
- The T21 snapshot at `models/public/vant/boot/axolotl-p_axolotl2026.svg`
  was correctly produced but the new ignore pattern blocked it from
  being visible. Per the convention in `models/public/vant/boot/README.md`,
  the horcrux is intentionally PUBLIC (other agents must be able to
  discover and restore it).
- **Fix:** removed the `models/public/vant/boot/axolotl-p_*.svg` ignore
  pattern. Added a NOTE comment in `.gitignore` explaining that
  `models/public/*` is a public-template directory by design. The
  `bin/snapshot.js` output is now visible as untracked. `git
  check-ignore` confirms it is no longer ignored.

### T23 — Multibrain-aware `bin/horcrux.js`
- The old `horcrux.js` had a hardcoded `models/public/boot/hypha-brain-horcrux.svg`
  default and only supported an explicit `--password` flag. The
  filename convention `<agent>-p_<password>.svg` is self-describing,
  so the tool should pick it up automatically.
- **Fix:**
  - Module-scope `require('path')`/`require('fs')` (no per-call cost).
  - Added `readBrainStack(REPO_ROOT)` and `findDefaultHorcrux(REPO_ROOT)`.
    Stack is read from `models/state.json` (`brain.getStack()`); for
    each stack entry, scan `models/public/<brain>/boot/` for the
    first `*-p_*.svg`. Current brain wins.
  - `inspect <name>` (no args) now finds the default horcrux
    automatically.
  - `restore <name> [password]` accepts a positional password; if
    omitted, `transform.fromHorcrux` parses the filename via
    `secret.parseFilenamePassword` and decrypts with that key.
  - Help text rewritten to show multibrain awareness + `p_`
    convention.
- Lesson: when a tool has a convention, the tool should embrace
  the convention end-to-end rather than forcing flags. Captured in
  `models/private/vant/lessons.md`.

### T24 — `lib/transform.js:inspectHorcrux` self-decrypts
- `inspectHorcrux(path, options)` previously required an explicit
  `options.password`. `fromHorcrux` already had the
  `parseFilenamePassword` fallback; `inspectHorcrux` did not.
  This is the kind of "no-shim, no-fork" asymmetry the axolotl
  policy rejects.
- **Fix:** added the same `secret.parseFilenamePassword(horcruxPath)`
  call inside `inspectHorcrux` when no `options.password` is given.
  `bin/horcrux.js inspect` (no args) now round-trips against the
  filename's `p_` token. 1480/1480 tests pass post-fix.

### T25 — `lib/boot.js:_tryHorcruxRestore` is multibrain-aware
- The old `_tryHorcruxRestore` was hardcoded to look at
  `models/public/boot/hypha-brain-horcrux.svg`. After T22 the file
  no longer exists (the convention lives under
  `models/public/<brain>/boot/<agent>-p_<password>.svg`). A fresh
  boot with an empty `models/private/` would never restore.
- **Fix:** rewrote `_tryHorcruxRestore` to:
  1. Read the brain stack via `brain.getStack()`.
  2. For each stack entry, look for `<brain>/boot/<agent>-p_*.svg`
     (i.e. the per-brain boot directory).
  3. Try each candidate in stack order, decrypt with the `p_` token
     via `transform.fromHorcrux`.
  4. First successful restore wins; record `restored`, `source`,
     `brain`, `agent`, `file`, and a full `attempts` list.
- The function is internal (not on `module.exports`) — it is called
  from `init()` when `_checkPrivateBrain()` returns false. Its
  result is now also visible via `boot.getBootState()`.
- Side fix: `getBootState()` now exposes `horcruxRestored`,
  `horcruxSource`, and `horcruxAttempts` (it was missing these
  fields, breaking downstream visibility).

### T26 — End-to-end smoke test of the rewritten boot path
- Wrote `test/_horcrux_boot_smoke.js` to validate T25 end-to-end:
  moves `models/private/{vant,axolotl}` aside, calls `boot.init()`,
  asserts the restore happened from
  `models/public/vant/boot/axolotl-p_axolotl2026.svg`, then puts
  the stashed dirs back.
- Result: `horcruxRestored=true`, source correctly identified,
  all 10 boot layers loaded, and the round-tripped
  `models/private/axolotl/identity.md` was byte-identical to the
  stashed original (md5 verified).
- The smoke test was a one-shot and was removed before commit; it
  served its purpose. The pattern is now: a fresh agent that
  clones the repo, runs `node bin/vant.js start`, and has no
  `models/private/` will auto-restore the `p_`-encrypted
  horcrux it finds in the public boot dir.
- Test sweep post-T26: 1479/1480 passing; the one failure
  (`vant.test.js: remember falls back to brain when cache expires`)
  is pre-existing on the axolotl branch HEAD (reproduces on a clean
  stash of my changes) and unrelated to the horcrux work.

---

## Tools added this session

| Tool | Purpose | Persistent? |
|---|---|---|
| `bin/sweep.sh` | Test health gate (full + --quick modes) | ✅ in repo, versioned |
| `bin/snapshot.js` | Brain horcrux snapshot (verifiable stego-SVG) | ✅ in repo, versioned |
| Output: `models/public/vant/boot/axolotl-p_axolotl2026.svg` | First snapshot of axolotl state (T21) | ⚠️ untracked, reproducible via `bin/snapshot.js` |
| Output: `...svg.manifest.json` | Snapshot metadata (timestamp, git, format) | ⚠️ untracked, reproducible |
| Output: `...svg.sha256` | Integrity hash for the SVG | ⚠️ untracked, reproducible |

---

## Future b-T Candidates (audit noted, not in this session)

These were identified in the final `grep -E "backward|compatibility|deprecat|legacy|alias" lib/*.js` sweep. Items marked ✅ were resolved in T17; others are deferred to a future session.

- ✅ **`lib/agents.js:248, 939, 1047-1050`** — audited; not bloat. Internal config key normalization.
- ✅ **`lib/brain.js:2547`** — internal compatibility comment (not a runtime alias; just a doc marker).
- ✅ **`lib/embed.js:257`** — `embed`/`embedBatch` aliases removed (T17b). Canonical names are `generate`/`generateBatch`.
- ✅ **`lib/encrypt.js:297, 308, 482`** — `Encrypt.encode/decode/pbkdf2Sync` removed in T17; stego migrated.
- ✅ **`lib/islands.js:500, 525`** — `getManifestSync` "for test compatibility" removed in T18. Internal `_getManifestSync()` retained for lib internals.
- ✅ **`lib/lineage.js:129`** — `getHistory` "alias for trace" removed in T19. Zero callers anywhere.
- ✅ **`lib/mcp.js:3205`** — internal "now aliases to unified" comment (not a runtime alias).
- ✅ **`lib/secret.js:411-414`** — `getPassword/hasPassword/clearPassword` removed in T17; transform/boot migrated.
- ✅ **`lib/storage.js:719, 728, 733, 754`** — audited; "legacy" paths are real fallback code, not compat shims. Kept.
- ✅ **`lib/transform.js:1376`** — `validateHorcrux` "Legacy for backward compatibility" removed in T20. Callers migrated to `validateHorcruxData` (now properly exported).
- ✅ **`lib/transform.js:1441, 1461`** — `payload: parsed.payload` "Keep for compatibility" — removed as no-op.

---

## Deferred

### ~~Horcrux — Snapshot axolotl brain copy for future agents~~ — DONE (T21)
- Resolved in T21 via `bin/snapshot.js`. The stego-SVG horcrux at
  `models/public/boot/hypha-brain-horcrux.svg` is now the canonical
  "agent at this moment" snapshot, and `lib/boot.js` auto-discovers
  it on boot. The script is the versioned artifact; the SVG is
  gitignored. First snapshot taken 2026-08-29T08:41:57Z on
  commit `83d0a3c`.
- The "mechanical copy" path (private/vant → private/axolotl) was
  not chosen because it would clobber the live axolotl brain and
  is not a true restoreable format. The stego-SVG is the right
  primitive.

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
2. Read `models/private/axolotl/lessons.md` for accumulated context.
3. Read this file (TASKS.md) for task state.
4. Pick the next `todo` task in the Pending section above.
5. Update the section here when done and on commit.

## Session Conventions

- **Brain:** My lessons are in `models/private/axolotl/lessons.md`
- **Commit style:** `axolotl: <description>` with Co-authored-by trailer
- **Tests:** Run `node test/runner.js` before committing
- **No backwards compat:** Clean refactors only, no aliases or fallbacks
