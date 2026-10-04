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

---

# 8. Lock System PRD — full-system, multi-stage

> Owner brief: "walk back through, make sure the lock garden we planted is
> fully seeded, watered, and ready to grow. Everything needs to be wired up,
> and we need to look for stuff that should be wired. … ensure both types of
> lock are proper separation of concern. … document all."
>
> This PRD is the forward plan. Sections 1–7 are the history (inventory →
> proposal → rename → §4 execution). Sections 8.x are the work still to do,
> broken into stages **S1–S6** so each can be hit in detail. A stage is only
> "done" when its acceptance criteria AND the §8.8 gates are green.

## 8.1 System model (what exists today)

Two **lock** types, deliberately separate (separation of concern):

| | `lib/brain-lock.js` | `lib/lock.js` |
|---|---|---|
| Semantics | authorization **lease** — *who may write to this brain* | cross-process **mutex** — *serialize a whole-snapshot write* |
| Lifetime | long (TTL default 1h) | short (hold across one write) |
| Identity | token + agentId, rate-guarded | none (advisory file) |
| Root | `models/private/.locks/.lock-<brain>.json` | `models/private/<brain>/.locks/<kind>[__<id>].lock` |
| Public API | `acquireBrainLock`/`releaseBrainLock`/`brainLockStatus`/`forceReleaseBrainLock` | `acquire`/`release`/`withLock` + `mutex()` + `pathFor()` |
| Used by | `bin/lock.js` (`vant lock`), MCP `vant_lock`, sandbox, shell, vant, tmp, security, boot | state-store, market, teams, agents, habitat, consensus/cache/canvas (in-proc) |

Three **non-lock serializers** that must NOT be confused with either (see §8.3):

* `lock.mutex()` — in-process promise-chain mutual exclusion (cache/canvas/consensus).
* in-process **save chains** — `teams._teamsSaveChain`, `agents._saveChain` (same-process write ordering, *not* cross-process safe).
* `lib/recursion.js` `guard` — reentrancy/depth guard, **not** a lock.

## 8.2 Walk-back audit — findings (grounded, with evidence)

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| F1 | Lease "rate-limited 10/min" is **declared but never wired**; `_checkRateLimit` has no caller AND references an undefined `errors` (would `ReferenceError`) | `lib/brain-lock.js:128-136`; no `_checkRateLimit(` caller; no `errors` require | **High** |
| F2 | `brain-lock` exports **no `getLayerStatus`** → `vant boot` reports a hardcoded `{name:'Lock',enabled:true}` while every peer layer reports truth | `lib/boot.js:529`; compare `lib/qos.js`, `lib/escrow.js`, `lib/sandbox.js` | Medium |
| F3 | `listStackLocks` spreads brain-name **strings** (`{...'abc'}` → `{0:'a',…}`) → junk; `listBrainLocks(options)` ignores `options` | `lib/brain-lock.js:104`, `:498-508` | Medium |
| F4 | `vant lock release` checks **truthiness** of an always-object result → prints "Lock released" and **deletes the token** even on a denied release | `bin/lock.js:86-92` vs `releaseBrainLock` returning `{success,message}` | **High** |
| F5 | `getState().lockStatus` returns the **function reference**, not the status | `lib/vant.js:856` | Low |
| F6 | `lib/tmp.js` takes the lease through an **implicit `global._lock`**; if a caller never set it the lock is silently skipped | `lib/tmp.js:169,190,222,232`; only `bin/tmp.js` (and shell/sandbox) set `global._lock` | Medium |
| F7 | `withLock` (the shared RAII helper) is used by **market only**; teams/agents/habitat/state-store hand-roll acquire/try/finally | `lib/market.js:714` vs `teams:500`, `agents:258`, `habitat:83`, `state-store:175` | Medium (DRY) |
| F8 | **Two `.locks` roots** (lease `models/private/.locks/`, mutex `models/private/<brain>/.locks/`) — boundary is real but undocumented | `lib/brain-lock.js:44,122` vs `lib/lock.js pathFor` | Medium (doc) |
| F9 | `brain-lock` **reimplements** coordination (TTL/backoff/stale) instead of sharing `lib/lock.js` primitives | `lib/brain-lock.js` vs LOCKS.md §3.1 | Low |
| F10 | A **third** serializer family — in-process save chains — is unclassified | `lib/teams.js:482`, `lib/agents/internal.js:248` | Low |
| F11 | `lib/recursion.js` `guard` is **not a lock** but sits in the same conceptual space; must be explicitly excluded | `lib/recursion.js:223` | Doc |
| F12 | A long tail of **whole-snapshot writers bypass the mutex** (the pass-95/96/98 bug class) — needs per-module triage | §8.5 | **High (triage)** |
| F13 | **No `docs/` page** documents the lock system | `docs/` has no lock page | Doc |

## 8.3 Separation-of-concern contract (to be asserted, not just described)

1. **Lease answers "who", mutex answers "not-at-the-same-time".** A module uses
   the lease to gate an *authorized writer*, the mutex to make one *snapshot
   write* atomic across processes. Neither substitutes for the other.
2. **Lease ≠ mutex internally.** The lease must not be used to serialize a
   state write; the mutex must never carry token/agent/authorization meaning.
3. **Cross-process vs in-process is explicit.** `lock.acquire`/`withLock` are
   cross-process. `lock.mutex()` is in-process only. Save chains are in-process
   ordering only and must never be described as "locking".
4. **`guard` (recursion) is out of scope** — it is a depth/reentrancy guard.
5. **One mutex root, one lease root**, both documented in §8.1 and locked in
   by `scripts/audit-locks.js`.

## 8.4 Wire-up matrix ("stuff that should be wired")

| Seam | Current | Target | Stage |
|------|---------|--------|-------|
| Lease rate limit | dead + broken (F1) | wired, correct error, tested (or the claim removed) | S1 |
| Boot `lock` layer status | hardcoded fallback (F2) | real `getLayerStatus()` | S1 |
| Stack lock listing | spreads strings (F3) | real rows `{brain,agentId,valid,age,…}` | S1 |
| `vant lock release` | false success + token wipe (F4) | honours `result.success` | S1 |
| `getState().lockStatus` | function ref (F5) | live status object | S1 |
| `tmp` locking | implicit `global._lock` (F6) | direct `require('./brain-lock')`, no global | S3 |
| Health surface | absent | lock status in `health.getStackHealthStatus` | S3 |
| MCP | `vant_lock` only | `vant_lock` reports stack status honestly | S3 |
| Snapshot writers | ad-hoc acquire (F7) | `withLock` where RAII fits | S4 |
| Unguarded writers | unaudited (F12) | triaged (§8.5) + guarded/merged or explicitly accepted | S5 |

## 8.5 Unguarded whole-snapshot writer triage (F12) — DECIDED (pass 111)

These write a whole in-memory snapshot and are **not** on the mutex path.
Decision legend: **(a)** guard with `lock.withLock` + merge-under-lock,
**(b)** accept because single-writer/append-only/self-healing, **(c)** merge
on read. Swept from a `store.write(...JSON.stringify...)` pass over lib/.

| Module · writer | Exposure | Decision | Rationale |
|---|---|---|---|
| `auth.js` lockout (`.circuit-auth.json`) | two processes recording failures → whole-map clobber silently UN-LOCKS a peer's brute-force hold | **(a) guard** | security state; merge keeps later `lockoutUntil` per id (tie → higher count). Also fixed: the lockout branch never persisted (memory-only until next failure) |
| `vaf.js` blocklist (`.circuit-vaf.json`) | peer's block silently un-blocked | **(a) guard** | security state; merge keeps later `until` per ip, drops expired (the only delete path is expiry, so later-`until` union is safe) |
| `config.js` brain config | concurrent `config set` of different keys loses one | **(a) guard** | authoritative file; merge preserves disk-only TOP-LEVEL keys, writer wins keys it carries. Stays SYNC (bin/org.js + operator-caps consume the boolean) |
| `mcp.js` insights (`models/public/insights.json`) | read→write window spanned the embed awaits → concurrent `brain_share` drops a row | **(a) guard** | shared cross-brain knowledge feed; re-read under lock, dedupe by id, prepend, cap 100 |
| `citations.js` addSource | concurrent adds drop a source row | **(a) guard** | provenance rows; re-read under lock, push. Fail-closed `null` when the lock cannot be taken (public API, no internal callers) |
| `audit.js` ledger + rotate | multi-process appends could lose rows | **(b) accept** | diagnostic trail, hash-chain ordering makes cross-process merge lossy by design; the ops log is `.audit.json` (append via storage) |
| `sync.js` provider states + privacy | last-writer-wins per-provider row | **(b) accept** | status rows self-heal on the next sync; cosmetic loss only |
| `skills.js` manifest (`loaded/hydrated`) | loss = re-hydration work | **(b) accept** | regenerable cache marker, not data |
| `islands.js` manifest | loss = island rediscovery | **(b) accept** | derived from a disk scan; regenerable |
| `succession.js` config + `.ledger.json` | rare owner-operated writes could clash | **(b) accept** | human-gated single-operator workflow by design (§ trust levels) |
| `migrations.js` marker | two migrators at boot | **(b) accept** | boot-time single-migrator (pass-97 collision handling); marker content is idempotent per layout version |

**New primitive (pass 111):** `lock.pathForGlobal(kind, id)` →
`models/.locks-global/<kind>[__<id>].lock` — repo-scoped resources (auth,
vaf, cross-brain insights) are anchored OUTSIDE any brain, so a per-brain
lock would split-brain two processes pinned to different brains. Same
discipline as `pathFor()`; audit scans it for leaks. Behavioral gates:
test/snapshot-guards.test.js (6).

## 8.6 Stages

### S1 — Truth-up the lease (`lib/brain-lock.js`)  · fixes F1, F2, F3, F4, F5
- **Changes:** wire the rate limit correctly (require `./error`; call
  `_checkRateLimit` in `acquireBrainLock`; add a test that the 11th acquire in
  a window raises the coded error) OR remove the dead claim plus its constant;
  add `getLayerStatus()`; fix `listStackLocks` to emit real rows and
  `listBrainLocks` to be honest about its args; `bin/lock.js` release honours
  `result.success`; `getState().lockStatus` returns data.
- **Acceptance:** a test drives >10 acquires and asserts the coded error; a test
  asserts `listStackLocks()` rows have `{brain, agentId, valid}`; `bin/lock.js
  release` with a wrong token exits non-zero and keeps the token file; `boot`
  layer status for `lock` is not the hardcoded fallback.

### S2 — Separation-of-concern contract  · fixes F8, F9, F10, F11
- **Changes:** write §8.3 into the code as headers + a `labs/` note; decide and
  document the two roots; classify save chains and `guard` (rename comments,
  not symbols, unless a rename is cheap); optionally have the lease reuse
  `lock.pathFor`-style helpers without taking mutex semantics.
- **Acceptance:** every lock-ish symbol in `lib/` is either in the §8.1 table or
  explicitly listed as a non-lock; `scripts/audit-locks.js` asserts the two-root
  invariant and that `guard`/save-chains are not lock files.

### S3 — Complete the wire-up  · fixes F6, F2-health, F4-CLI, MCP
- **Changes:** `tmp` requires `brain-lock` directly (drop `global._lock`); add
  lock status to `health.getStackHealthStatus`; make MCP `vant_lock` and
  `vant lock --help|--status` report stack status; ensure `boot` init surfaces
  the layer.
- **Acceptance:** `vant health` shows lock state; `tmp` works with no global set.

### S4 — Migrate hand-rolled acquire/release onto `withLock`  · fixes F7
- **Changes:** convert `state-store.persistMerged`, `teams._saveTeams`,
  `agents._saveAgents`, `habitat.save` to `lock.withLock(path, fn, {failMode})`
  preserving the fail-closed posture and the merge-under-lock atomicity.
- **Acceptance:** all crossprocess suites stay green; the fail-closed gates in
  `test/lock-failclosed.test.js` stay green; no behaviour change except DRY.

### S5 — Unguarded-writer triage  · fixes F12
- **Changes:** work §8.5; implement (a)/(b)/(c) per module with tests for any
  that adopt a guard. Record the decision matrix in this doc.
- **Acceptance:** each §8.5 module has an explicit decision + test or a written
  "accept because…".

### S6 — Documentation  · fixes F13 and all
- **Deliverables:** `docs/operations/locks.md` (the two types, roots, failure
  postures, examples), `docs/reference/locks.md` + MCP reference entry for
  `vant_lock`, README pointer, refreshed `ROADMAP.md` lock lines (557/599/606),
  and accurate module docstrings.
- **Acceptance:** `npm run lint:docs` green; docs describe the shipped behaviour
  (no aspirational claims like the old rate limit).

## 8.7 Definition of done

All of: §8.2 findings F1–F13 closed or consciously accepted; §8.3 asserted by
`scripts/audit-locks.js`; §8.4/§8.6 stages complete; §8.8 gates green; docs
shipped. State is captured by the tracker below.

## 8.8 Gates (every stage)

sweep chunked (all `test/*.test.js`) · `lint:docs`/`lint:surface`/`lint:helpers`/
`lint:locks` · `npm run check` · `npx eslint <touched>` (0 errors) · `npm test`
· `test-all` · `test-core` · `audit-mcp` (THREW 0 / PHANTOM 0) · zero leaked
locks · scratch brains wiped.

## 8.9 Non-goals / risks

- Not redesigning the lease into the mutex or vice-versa (§8.3 keeps them apart).
- S5 may conclude some writers stay unguarded — that is a valid, documented outcome.
- Renames are avoided unless they cheaply reduce confusion; behaviour changes
  are gated behind the fail-closed posture already shipped.

## 8.10 Stage tracker

- [x] **S1 — Truth-up the lease (F1–F5)** — done pass 105 (see §8.11)
- [x] **S2 — Separation-of-concern contract (F8–F11)** — done pass 106 (see §8.11)
- [x] **S3 — Complete the wire-up (F6, health, MCP)** — done pass 107 (see §8.11)
- [x] **Interim QC — lease/mutex defect hunt (L1–L4)** — done pass 108 (see §8.11)
- [x] **S4 — Migrate to `withLock` (F7)** — done pass 109 (see §8.11)
- [x] **S5 — Unguarded-writer triage (F12)** — done pass 111 (see §8.11 + §8.5 matrix)
- [x] **S6 — Documentation (F13)** — done pass 112 (see §8.11)

## 8.11 Execution log

### S6 — Documentation (pass 112, done)

- **F13 closed.** Docs describe the SHIPPED system (postures, roots, exact
  signatures verified against lib/ and bin/ — no aspirational claims; the
  removed rate limit is mentioned only as a removed thing):
  - `docs/operations/locks.md` (new): the two types side by side, both roots
    and WHY they differ, the lease (CLI + programmatic examples, same-agent
    refresh, CAS takeover, token-verified release, "rate limiting is not
    here"), the mutex (withLock/pathFor/pathForGlobal, reason values, always-
    Promise contract), the "which path helper?" table (per-brain vs
    repo-scoped), failure postures (closed vs open), the NOT-a-lock table
    (mutex() / save chains / recursion guard), diagnostics.
  - `docs/reference/locks.md` (new): full export tables for both modules
    (signatures + return shapes), `vant lock` CLI verbs (verified against
    bin/lock.js: acquire/release/status/force + short forms; no `stack` CLI
    verb — status covers the stack), the `vant_lock` MCP tool (all 5 actions
    + return shapes), the on-disk path table.
  - `docs/reference/mcp-tools.md`: vant_lock entry expanded (all 5 actions +
    token/agentId params, link to the API page); Return Types row updated
    from the pass-97-era `{ token }` to the real per-action shapes.
  - Indexes: docs/operations/index.md + docs/reference/index.md rows added
    (nav_order 66 / 136, next free slots). README Reference section points at
    the operations page.
  - `ROADMAP.md` lock lines refreshed (was stale "TODO / rate limits"):
    module table row, checkbox, and progress log all now record the shipped
    state and point at the docs.
  - Module docstrings audited: already accurate (pass 105 removed the
    rate-limit claim; the only `flock` mention left is lock.js's historical
    "renamed from lib/flock.js, pass 102" note, which is correct).
- **Style/links:** both new pages pass the docs linters (no em dashes, no
  emoji/glyphs in prose, fenced blocks tagged, tables close with a pipe,
  heading levels contiguous, all permalinks resolve).
- **Gates:** lint:docs/style/links PASS; lint:locks PASS (0 leaked);
  lint:surface/helpers PASS; `npm run check` syntax OK; sweep 158/158
  (env-free); npm test 15/15; test-core 5/5; test-all exit 0; audit-mcp
  296 reg / THREW 0 / PHANTOM 0; scratch wiped; eslint clean on touched
  (docs only, no lib changes this pass).

### S5 — Unguarded-writer triage (pass 111, done)

- **F12 closed.** All eleven §8.5 candidates triaged — decision matrix recorded
  in §8.5. Five adopted **(a) merge-under-lock guards** (auth lockout, vaf
  blocklist, brain config, mcp insights, citations); six **(b) accepted** with
  written reasons (audit ledger, sync states, skills/islands manifests,
  succession, migrations marker). No (c) needed.
- **New primitive:** `lock.pathForGlobal(kind, id)` → `models/.locks-global/`
  for repo-scoped resources (auth/vaf state lives outside any brain; a
  per-brain lock would split-brain). Same wx/stale/symlink discipline; audit
  scans it for leaks; `.gitignore` covers it.
- **Merge semantics:** auth keeps later `lockoutUntil` per id (tie → higher
  count); vaf keeps later `until` and drops expired (only delete path is
  expiry); config shallow-merges disk-only top-level keys under the per-brain
  lock (stays SYNC — bin/org.js + operator-caps consume the boolean);
  mcp re-reads under the repo-global lock after the embed awaits, dedupes by
  id, caps 100; citations re-reads under the per-brain lock, fail-closed
  `null` on refusal.
- **BONUS fix:** auth's lockout branch returned WITHOUT saving — lockouts
  were memory-only until the next failure (restart/peer never saw them).
  Now persisted.
- **Harness catch:** the first vaf merge used `Object.entries(map)` on a Map
  (yields `[]`) and silently dropped local blocks — the new behavioral gate
  caught it immediately. Map iteration (`for…of map`) is required.
- **Tests:** test/snapshot-guards.test.js — 6 gates (4 behavioral merge,
  auth lockout persistence, mcp static — the handler needs an embed provider
  and is not offline-runnable). Suite count 157→158.
- **Gates:** sweep 158/158 (env-free); lint:locks/docs/surface/helpers PASS;
  eslint 0 errors on touched; `npm run check`; npm test 15/15; test-core
  5/5; test-all exit 0; audit-locks PASS incl. new F12 gate (0 leaked); MCP
  audit 296 reg / THREW 0 / PHANTOM 0 (baseline); scratch wiped.

### Native lock contention — drop the monkeypatch seam (pass 110, done)

Owner flagged the "monkey patch" language from pass 109 and asked for native
fixes — no fallbacks, shims, or test-shaped wiring. Done:

- **lib/lock.js: withLock calls the internal `acquire` directly again.** The
  pass-109 `module.exports.acquire` indirection existed ONLY so the fail-
  closed tests' `lock.acquire = heldFail` property replacement kept
  intercepting — production structure shaped by a test's patching style.
  Reverted to the direct call.
- **Fail-closed gates now create REAL contention.** lock-failclosed and
  market-crossprocess gate D no longer replace any module property: they
  place a regular FILE at the scratch brain's lock root
  (`models/private/<brain>/.locks`), which makes every real `acquire()` fail
  with `unavailable` instantly (mkdirSync on a file path throws). The actual
  filesystem failure path is exercised end-to-end — strictly stronger than
  the stub. Gate C's withLock spy stays: it wraps and delegates to the real
  implementation (measurement only, no behavior replaced).
- **BONUS: the switch flushed a real pass-109 bug.** `teams._saveTeams`
  checked `.aborted` on withLock's return WITHOUT awaiting — withLock
  resolves to a Promise, so teams' fail-closed log had been dead since pass
  109 (the write refusal still worked via closed mode; only observability
  was lost — the disk-state assertions never caught it). Now awaited; log
  fires (`[teams] Orgchart lock unavailable — refusing unlocked write`). The
  write itself remains synchronous (withLock runs the body synchronously
  when the lock is available), preserving the pass-89 restoreState exit-
  safety contract; both docstring blocks updated.
- **Census after:** zero property replacements on lock modules in product
  code; remaining in tests: gate C's wrap-and-delegate spy only.
- **Gates:** sweep 157/157 (env-free); lint:locks/docs/surface/helpers
  PASS; eslint 0 errors on touched (6 pre-existing warnings); `npm run
  check`; npm test 15/15; test-core 5/5; test-all exit 0; audit-locks PASS
  (0 leaked); MCP audit 296 reg / THREW 0 / PHANTOM 0 (baseline); scratch
  wiped.

### S4 — Migrate to `withLock` (pass 109, done)

- **F7 closed.** All four whole-snapshot writers now go through
  `lock.withLock` (failMode 'closed') instead of hand-rolled
  acquire/try/finally-release: `state-store.persistMerged`,
  `teams._saveTeams`, `agents/internal._saveAgents`, `habitat.save`. The
  dead `_acquire*/_release*` helpers in teams.js and habitat.js are gone
  (path helpers kept). Fail-closed posture, merge-under-lock atomicity, the
  `{ staleMs: 10000, waitMs: 8000 }` timings, and every return contract are
  unchanged — the only behavior delta is DRY plus the exit-hook coverage
  withLock already had.
- **Interface note:** `persistMerged` is now async (withLock always returns
  a Promise). Its four lib callers (consensus/settlement/node-registry/
  market `_persist`) ignore the return; the two lock-failclosed tests now
  `await` it. `teams._saveTeams` keeps its sync body and `_teamsSaveChain`
  return; `habitat.save` stays async returning state/null.
- **withLock honors the test seam.** `withLock` now routes acquire through
  the exported binding (`module.exports.acquire`) so the fail-closed
  tests' `lock.acquire = heldFail` monkeypatch keeps intercepting it
  instead of being bypassed by the internal reference.
- **Audit gate extended (F7).** `scripts/audit-locks.js` now requires ALL
  four writers to contain `withLock(` (previously only teams/agents were
  checked for a mutex require) — hand-rolled acquire/release sneaking back
  is now an audit failure.
- **Gate C spy scope fixed.** market-crossprocess's withLock spy counted
  ALL withLock calls, so F7's persistMerged migration tripped it; the spy
  now counts only `'market-trade'` path locks, preserving the pass-101
  gate's actual intent (per-listing lock SCOPE). Gate D's wholesale
  withLock stub needed no change.
- **Tests:** no new suites; lock-failclosed 6/6, market-crossprocess 8/8,
  state-store/teams/habitat/roster/consensus-reap crossprocess all green.
- **Gates:** sweep 157/157 (env-free); lint:locks/docs/surface/helpers
  PASS; eslint 0 errors on touched (5 pre-existing warnings); `npm run
  check`; npm test 15/15; test-core 5/5; test-all exit 0; audit-locks PASS
  (0 leaked); MCP audit 296 reg / THREW 0 / PHANTOM 0 (baseline); scratch
  wiped.

### Interim QC — lease/mutex defect hunt (pass 108, done)

Owner flagged "def bugs" in the recent lock commits; a probe-driven hunt
(scratch script, since deleted) confirmed FOUR and fixed all of them.

- **L1 — same-agent re-acquire FAILED (brain-lock).** The "we already own
  it" branch compared the file token against a token freshly generated in
  the same call — dead code — so a same-agent re-acquire (nested
  sandbox.write, `vant lock acquire` twice) was misclassified as contention
  and returned null after ~1.5s of backoff WHILE ALREADY HOLDING the lease.
  Fixed: refresh by agentId; the FILE token is kept stable so outstanding
  references stay valid; emits `brain-lock:refreshed`.
- **L2 — stale-takeover race could yield TWO holders (brain-lock).**
  Takeover was a blind atomic REPLACE (writeRaw = temp+rename, no freshness
  re-check): two agents reading the same stale lock could both replace it
  and both pass the read-back verify (last writer wins the file). Probe: 1
  in 12 two-child races produced two live holders of an exclusive lease.
  Fixed: takeover re-checks staleness, then takes the file with O_EXCL
  (`wx`) — a create-or-fail CAS; losers re-read and back off. Symlink guard
  preserved (planted symlink refuses O_EXCL and is swept).
- **L3 — release() clobbered a successor's live lock (lock mutex).**
  release() (and the exit hook) unlinked by path with no ownership check,
  so a stalled holder whose lock was stale-taken-over deleted the
  SUCCESSOR's fresh lockfile — two writers inside the mutex. Deterministic
  probe repro. Fixed: release/exit-hook only unlink when the file's pid is
  ours (`_ownsLock`); corrupt/vanished files are left to the stale sweep.
  Also bounded the takeover loop (hostile symlink replant could spin it
  forever).
- **L4 — forceReleaseBrainLock() returned undefined (brain-lock).** MCP
  `vant_lock force` reported `forceReleased: undefined`. Now returns a
  boolean and emits `brain-lock:force-released`.
- **Tests:** test/lock.test.js 13→15 (release-ownership, exit-hook vs
  successor), test/brain-lock.test.js 18→21 (refresh gate, CAS race gate
  over 4 two-child iterations, boolean force). Pre-existing gates unchanged
  and green.
- **Gates:** sweep 157/157 (env-free); lint:locks/docs/surface/helpers
  PASS; eslint 0 errors on touched; `npm run check`; npm test 15/15;
  test-core 5/5; test-all exit 0; audit-locks PASS (0 leaked); MCP audit
  296 reg / THREW 0 / PHANTOM 0 (baseline); scratch wiped.

### S3 — Complete the wire-up (pass 107, done)

- **F6 (tmp lease) — fixed.** `lib/tmp.js` put/delete lazy-require
  `./brain-lock` and call `acquireBrainLock`(`tmp:<space>:write|delete`) /
  `releaseBrainLock` directly, replacing `global._lock?.acquire?.` (a shared
  global only bin/tmp.js / shell / sandbox set — any other caller silently ran
  unlocked). shell.js was the last `global._lock` writer; it now uses a local
  lazy cache, so the global is gone. bin/tmp.js no longer wires it.
- **Health surface — wired.** `health.getStackHealthStatus` returns a `lock`
  field `{layer, byBrain, held}` from brain-lock's stack helpers (read-only; the
  helpers pass the brain explicitly, no pushBrain mutation). `vant health`
  prints a Lock section.
- **MCP — wired.** `vant_lock` `status` now includes `stack`+`held`; added a
  `stack` action for the whole-stack view (enum updated).
- **CLI — wired.** `vant lock status` prints the whole-stack view; help text
  updated.
- **boot init — surfaced.** Removed the dead `if (lock.init)` (brain-lock has no
  init); loading the module is what makes `getLayerStatus().lock` real.
- **Tests:** test/brain-lock.test.js +4 (MCP status/stack, health lock, CLI
  status), test/health.test.js +1, test/tmp.test.js +3 (static F6 gates + a
  `vant tmp create` spawn with no global). 11 files.
- **Harness note:** run the 157 sweep WITHOUT `VANT_BRAIN`;
  test/migrations.test.js's spawned probe inherits it and false-fails the
  legacy-main read test (157/157 with it unset).
- **Gates:** sweep 157/157; lint:locks/docs/surface/helpers PASS; eslint 0
  errors on touched; `npm run check`; npm test 15/15; test-core 5/5; test-all
  exit 0; MCP audit 296 reg / THREW 0 / PHANTOM 0; zero leaked locks; scratch
  wiped.

### S2 — Separation-of-concern contract (pass 106, done)

- **F8 (two roots) — documented + asserted.** Mutex `lib/lock.js` root =
  `models/private/<brain>/.locks/` via `pathFor()`. Lease `lib/brain-lock.js`
  root = `models/private/.locks/.lock-<brain>.json` — one dir ABOVE the
  per-brain dirs, REPLACED atomically (temp+rename), not O_EXCL. Added a
  separation-of-concern header to each stating neither substitutes for the
  other and they must not be folded. `audit-locks` now fails if either module
  requires the other.
- **F11 (recursion guard) — classified.** `lib/recursion.js` `guard` header
  now says it is a depth/reentrancy guard, NOT a lock, and deliberately
  requires NEITHER lock module; asserted by the audit.
- **F10 (save chains) — classified.** `_teamsSaveChain` (lib/teams.js) and
  `_saveChain` (lib/agents/internal.js) labelled IN-PROCESS write-ordering
  only; the cross-process control is the lockfile taken in `_saveTeams` /
  `_saveAgents`. `audit-locks` fails if either writer stops requiring the mutex.
- **Audit (`scripts/audit-locks.js`) — extended** with the §8.3 contract:
  mutex root per-brain, lease root cross-brain, no cross-require, `recursion.js`
  non-lock, whole-snapshot writers take the mutex. Report now prints both roots
  + the non-lock + the guarded writers.
- **No renames** (PRD §8.9: avoid unless cheap). 6 files: lib/lock.js,
  lib/brain-lock.js, lib/recursion.js, lib/teams.js, lib/agents/internal.js,
  scripts/audit-locks.js.
- **Gates:** sweep 157/157 chunked; lint:locks PASS; lint:docs (129)
  /surface/helpers PASS; `npm run check`; eslint 0 errors on touched; audit-mcp
  296 reg / THREW 0 / PHANTOM 0; `npm test` 15/15; test-all exit 0; test-core
  5/5; zero leaked locks; scratch wiped.

### S1 — Truth-up the lease (pass 105, done)

- **F1 (rate limit) — RESOLVED by REMOVAL, on separation-of-concern grounds.**
  The lease is acquired HOT by internal writers (`sandbox-write`, `shell:exec`,
  `tmp:*`) as well as by `vant lock`; a per-agent per-minute cap there would
  throttle legitimate internal acquires. Rate limiting is **QoS's** concern
  (`lib/qos.js`), not the lock's. Deleted the dead `_checkRateLimit`, the
  `RATE_LIMIT_WINDOW`/`MAX_ACQUIRES_PER_MINUTE` constants, the unused
  `rateLimits`/`acquireAttempts` maps, and the docstring's "rate-limited"
  claim — so the header stops promising a limit that never fired (and that
  would have thrown `ReferenceError` if it had).
- **F2 (layer status) — `getLayerStatus()` added**
  (`{name:'Brain lock', type:'authorization_lease', enabled:true,
  trackedBrains, defaultTtlMs}`), so `vant boot` reports the real layer instead
  of the hardcoded fallback.
- **F3 (stack listing) — fixed.** `listStackLocks` now emits real held-lock
  rows (`{brain,agentId,token,age,valid}`) instead of spreading brain-name
  strings; `listBrainLocks` (the junk source) removed. Both stack helpers now
  pass the brain EXPLICITLY to `brainLockStatus` instead of mutating the
  process-active brain via `pushBrain`/`removeBrain`.
- **F4 (CLI release) — fixed.** `bin/lock.js release` tests `result.success`,
  not truthiness, and no longer prints "Lock released" / wipes the token on a
  denied release.
- **F5 (`getState().lockStatus`) — fixed** to report the live status value, not
  the function reference.
- **Gates:** new/updated `test/brain-lock.test.js` (14, incl. F2/F3/F4/F5
  gates); sweep 157/157 chunked; lint:docs/surface/helpers/locks PASS; `npm run
  check`; eslint 0 errors on touched; audit-mcp 296 / THREW 0 / PHANTOM 0;
  `npm test` 15/15; test-all exit 0; test-core 5/5; zero leaked locks.
