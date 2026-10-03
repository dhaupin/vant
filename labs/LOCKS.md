# Vant Locks — Inventory & Canonicalization Proposal (pass 101)

> Owner's hunch: lock states/methods/systems have gotten "scattered and
> spaghetti". **Confirmed.** There are two lock *concepts* sharing the word
> "lock", a third dead engine, four different lock-path formulas, two ad-hoc
> in-process mutexes, and two different failure postures.
> This doc is the inventory + a proposal. **No refactor has been done yet.**

---

## 1. Inventory (everything that serializes or leases)

| # | Mechanism | Kind | Scope | Storage / naming | Used by |
|---|-----------|------|-------|------------------|---------|
| A | `lib/lock.js` ("Agent Lock Manager") | ownership / authorization **lease** (token- + agent-verified, TTL default 1h, rate-limited 10/min, emits events) | brain-scoped | `models/private/.locks/.lock-<brain>.json` (LOCK_DIR `.locks`, basePath `models/private`) | `bin/lock.js` (`vant lock`), MCP `vant_lock`, `lib/vant.js` (agent state), `lib/sandbox.js` (`sandbox-write`), `lib/shell.js` (`shell:exec`), `lib/security.js` + `lib/boot.js` (status), `lib/config.js` (`setLockOptions`) |
| B | `lib/flock.js` (pass 98) | advisory cross-process **mutex** (O_EXCL `wx`, stale takeover 5s, bounded wait 500ms, symlink guard, exit-hook release) | per-resource, cross-process | ad-hoc paths (see §2) | `lib/state-store.js` (all state files), `lib/market.js` (per-listing), `lib/teams.js`, `lib/agents/internal.js`, `lib/habitat.js` |
| C1 | `lib/consensus.js` `_topicLocks` + `_lockTopic(topic, fn)` | in-process promise-chain **mutex** (per topic) | single process | n/a | consensus `create`/`vote`/`resolve` |
| C2 | `lib/cache.js` `_withLock(fn)` (`_cacheLock`) | in-process promise-chain mutex | per Cache instance | n/a | cache `set`/`get` |
| C3 | `lib/canvas.js` `_withLock(fn)` | in-process promise-chain mutex | module-global | n/a | canvas paint/save/share |
| D | `lib/storage.js` `LockStorage` (`acquire`/`has`/`renew`/`release`, TTL-based) | file-lock engine #3 | cwd-relative | `<cwd>/.locks/.lock-<id>.json` | **no call sites found** (exported + registered as a storage type, `getStorage('lock')` never called) |
| E | `market._reserved` | in-process **reservation counter** (not a lock, but the same "hold then release" idea) | single process | not persisted (crash-safe by design) | `lib/market.js` `trade()` |

`lib/boot.js` also reports a `Lock` security layer via `lock.getLayerStatus?.()`.

## 2. Lock-path formulas (four, none shared)

- A: `models/private/.locks/.lock-<brain>.json` — `path.join(LOCK_DIR, ...)` (dir `.locks`).
- B-state-store: `models/private/<brain>/.<sanitized>.lock` — `state-store.lockPathFor()`.
- B-teams/agents: `models/private/<brain>/orgchart/{teams,agents}.json.lock` — `<storePath> + '.lock'`.
- B-habitat: `models/private/<brain>/.habitat.lock` — `path.resolve(base, '.habitat.lock')`.
- D: `<cwd>/.locks/.lock-<id>.json`.

So a single brain dir can contain locks in three different places
(`.locks/`, `.<x>.lock` at root, `orgchart/*.lock`), plus a repo-root
`.locks/` from the dead engine. "Which lock covers resource X?" requires
grepping.

## 3. Findings (the actual spaghetti)

1. **Two concepts, one name.** `lib/lock.js` is an *authorization lease*
   (who may write, token-verified, long-lived). `lib/flock.js` is a
   *write-serialization mutex* (short, advisory). Only flock's header says
   so; `lib/lock.js` calls itself "Agent Lock Manager" and claims it
   "prevents race conditions", which invites using the wrong one for state
   writes. They share **no code** — lib/lock.js reimplements
   acquire/release/stale/retry/TTL.
2. **Four path formulas** (§2) with no registry.
3. **Two failure postures.** `flock` callers choose ad hoc:
   - market: **fail-closed** (`E_TRADE_LOCK`, pass 101);
   - teams/agents/habitat: **fail-open** — `console.warn(... proceed ...)`
     and last-writer-wins.
   Same primitive, opposite safety default, decided per call site.
4. **`flock.acquire` conflates two failures** — "held by a live peer, wait
   expired" and "filesystem/dir unusable" both return `false`; callers cannot
   distinguish contention from environment error, so they cannot fail closed
   precisely.
5. **In-process mutexes don't compose with flock.** consensus has BOTH
   `_topicLocks` (in-process) and a state-store flock (cross-process) on the
   same maps; cache/canvas each hand-roll the promise chain. Three copies of
   the same 6-line pattern, and pass 90 had to patch one of them for
   poisoned-chain.
6. **A third engine is dead weight:** `LockStorage` (D) duplicates the
   concept, is exported, and is never used.

## 4. Proposal (discuss before implementing)

1. **Name the two concepts.**
   - Keep `lib/flock.js` as **the** mutex primitive. Keep the name.
   - Rename `lib/lock.js` → e.g. `lib/brain-lock.js` and document it as an
     *authorization lease*, explicitly "not a state-write mutex". Update the
     8 requires + CLI/MCP labels.
2. **Make posture explicit in the primitive.** `flock.acquire` returns
   `{ ok, reason }` where `reason ∈ {acquired, held, unavailable}`; add a
   `failMode: 'closed' | 'open'` option to `withLock`. Then every call site
   declares its posture instead of re-deriving the warn-and-proceed branch.
   Default to **closed**; the teams/agents/habitat call sites must opt into
   `open` consciously (or move to closed — see item 5).
3. **One lock root + one naming helper.** All file locks live under
   `models/private/<brain>/.locks/` with a deterministic
   `flock.pathFor(kind, id)` (e.g. `state/market` → `.locks/state__market.lock`,
   `market-trade/<id>` → `.locks/market-trade__<id>.lock`). `brain.js` already
   treats dot-dirs as infrastructure (not brains); migrations' `dropfiles`
   sweep only touches `<brain>/state/`, so `.locks/` at the brain root is
   safe. Retire the four formulas in §2.
4. **Collapse the ad-hoc in-process mutexes** onto one tiny shared
   `flock.mutex()` promise-chain helper (cache, canvas, consensus
   `_topicLocks`), with the pass-90 "don't let a rejection poison the chain"
   behavior baked in. Delete the unused `LockStorage` (D) unless a roadmap
   item needs it.
5. **Decide the fail-open call sites.** teams/agents/habitat currently
   degrade to last-writer-wins on lock failure. For creates that can silently
   lose rows (the exact pass-95/98 bug class), **fail-closed with a clear
   error** is more honest than a warning; pick per operation and record it.
6. **Make the surface enumerable.** Add a small audit (like
   `scripts/audit-mcp-surface.js`) that greps/asserts every lock call site,
   every lock path is under the brain root, and the suite leaves zero
   lockfiles behind. "Scattered" becomes "listed".

## 5. Relationship to the pass-101 market fix

The market fix already moved in this direction for one call site:
the lock body is now **fully synchronous** (await-free) and the posture is
**fail-closed**; open-ended listings take **no lock** at all. That is the
shape items 1–3 generalize. The `flock.withLock(async (locked) => ...)`
signature still forces an `async` wrapper even when the body is sync — a
canonical `withLock` should accept a sync fn and only go async when asked.

---

## 6. Pass 102 — naming split IMPLEMENTED (2026-10-03)

Owner decision: keep BOTH concepts but give them unambiguous names, at the
module **and** the fn/method/event level. OSS-facing, DRY/KISS.

| Concept | Old | New | Namescope |
|---------|-----|-----|-----------|
| Authorization lease (A) | `lib/lock.js` | **`lib/brain-lock.js`** | `acquireBrainLock` / `releaseBrainLock` / `brainLockStatus` / `forceReleaseBrainLock`; events `brain-lock:acquired\|released\|writePermissionMissing`; config `BRAIN_LOCK_CONFIG` |
| Cross-process mutex (B) | `lib/flock.js` | **`lib/lock.js`** | `acquire` / `release` / `withLock` (already lock-y; the module path is the namescope) |

Both module headers now cross-reference the other explicitly. The CLI
`vant lock` (bin/lock.js) still drives the **brain-lock** lease; the router
owning `lock: 'lock.js'` is a *bin* mapping, not the lib, so it is unchanged.
`.gitignore` now lists the lock schema explicitly (`models/**/*.lock` plus the
`.locks/` dirs and `.lock-brain-token`).

**Still open from §4** (deliberately NOT done in pass 102 — each is a behavior
change, not a rename): item 2 (`{ok,reason}` + `failMode`), item 3 (one lock
root + `flock.pathFor`), item 4 (collapse the in-process mutexes + delete dead
`LockStorage`), item 5 (decide the fail-open call sites), item 6 (lock audit).

---

## 7. Pass 103 — §4 items 2–6 IMPLEMENTED (2026-10-03)

Owner: "another labs/locks pass. This is needed." Done:

**Item 2 — posture in the primitive (`lib/lock.js`).**
`acquire()` now returns `{ ok, reason }` with
`reason ∈ {acquired, held, unavailable}` (so callers tell peer contention from
a broken filesystem). `withLock(path, fn, { failMode })`:
`failMode:'closed'` (DEFAULT) never runs `fn` without the lock and returns
`{ ok:false, reason, aborted:true }`; `'open'` runs `fn(result)` anyway. A sync
`fn` is released synchronously (no forced await). Added `mutex()` (see item 4).

**Item 3 — one lock root + `pathFor`.**
All file locks now live under `models/private/<brain>/.locks/` via
`lock.pathFor(kind, id)`. The four old formulas are gone; `state-store.lockPathFor`
delegates to `pathFor('state', …)`, and teams/agents/habitat/market use
`pathFor('teams'|'agents'|'habitat'|'market-trade', …)`. `.locks/` is a
brain-root dot-dir: migrations only sweeps `<brain>/state/`, and lib/brain
treats dot-dirs as infrastructure.

**Item 4 — one in-process mutex + dead code deleted.**
`lock.mutex()` (promise-chain, pass-90 poison-proof) now backs consensus
`_topicLocks`, `cache._withLock`, and `canvas._withLock` — three hand-rolled
copies deleted. `storage.LockStorage` (engine #3, zero call sites) removed
(class + `getStorage('lock')` case + export).

**Item 5 — fail-open sites decided → FAIL CLOSED.**
`state-store.persistMerged`, `teams._saveTeams`, `agents._saveAgents`,
`habitat.save` no longer degrade to an unlocked last-writer-wins write; on a
failed acquire they refuse the write and log the `reason`. BONUS: the agents
roster lock now spans merge **and** write (previously released in the gap);
teams already held it across merge+write.

**Item 6 — enumerable surface.**
`scripts/audit-locks.js` (`npm run lint:locks`) enumerates every lock require
and fails if any file outside `lib/lock.js`/`lib/brain-lock.js` builds an
ad-hoc lock path (`+ '.lock'` / `'.locks'`), if the old `lib/flock.js`
reappears, or if any `.locks/` lockfile is left behind. First run: 8 mutex
requires, 10 lease requires, 0 leaks.

New `test/lock.test.js` pins the primitive (reason, failMode, sync fn,
mutex poison-proofing, pathFor naming/sanitizing).
