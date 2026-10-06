# Cohesion Audit — axolotl (2026-09-20)

Goal: one consolidated stack — everything wired through the runtime/os surface
(storage, pipeline, error, event, version, brain facade), no old conventions
lingering. This is a findings doc, not a fix log.

**Update (same day):** A-1 and its restore-side sibling were verified and FIXED
(wrong-path requires, restore-block mis-nesting, and the missing payload unwrap
in `restore()` — a real horcrux round-trip now restores all sections). The
`pushBrain` test was also made order-independent (stack persists in
`models/state.json`). All suites re-verified green: 1,144 module tests + CI 406/406.

---

## A. Silent breakage (real bugs, highest priority)

| # | Finding | Detail |
|---|---------|--------|
| A-1 | **transform.js gather functions require wrong paths — FIXED 2026-09-20** | Lazy-requires inside `lib/transform.js` used `require('./lib/X')` — invalid from inside `lib/`. Verified: `gatherConsensus/Escrow/Msg/Realm/Market` returned `Cannot find module` errors (one duplicate `gatherMemory` at :854 was shadowed dead code and deleted); horcrux gather produced `{error: 'Cannot find module…'}` sections. Restore side had the same wrong paths **plus** a mis-nested block (consensus/escrow/msg/realm/market + the agents2/teams2/… restorations were inside `if (data.boot)`) and no `.payload` unwrap — so restoring a real horcrux silently restored nothing. All fixed; round-trip verified: `restored: [consensus, escrow, msg, realm, market, boot]`, 0 errors. |
| A-2 | **mcp.js `brain_save` bypasses category layout** | `brain.write('', key + '.md', content)` writes into the brain root with empty category — inconsistent with `brain_read`/`loadBrain` and the multibrain file layout. Should route through the standard category/key path. |
| A-3 | **Displaced comment banners (scar tissue)** | transform.js has orphaned banners: `@param options.full` floating above `gatherMemory`, `==== MEMORY ====` / `==== CONSENSUS ====` markers detached from their functions. Cosmetic, but the same automated edit that corrupted trust/governance may have displaced more — worth a docstring-vs-function pass repo-wide. |

## B. Old convention vs. new (cohesion debt)

| # | Finding | Detail |
|---|---------|--------|
| B-1 | **Raw `fs` outside the storage layer — service modules DONE 2026-09-20** | Migrated per the citations pattern (one commit each, suite green after every step): `citations`, `lock` (raw variants + brain-name validation), `resolution` (dead code removed), `prune` (ledger/LTC/scans; dir enumeration + mtime stay on fs — pattern-glob/metadata limitations), `canvas` (**closed live traversal hole** — artwork names were interpolated into raw write paths unguarded), `teams` (config-driven store path preserved). Remaining: agents, brain ~75 sites, mcp ~22 — same recipe, larger blast radius. Legit permanent fs users: storage.js, format.js, backup.js, sync.js (plumbing). |
| B-2 | **Two divergent security chains** | `pipeline.run()` (sandbox→vaf→qos→escrow middleware) vs. inline copies: brain.js `_runBrainSecurityChain`, storage.js `_checkWriteSafe`/`_checkReadSafe`, trust/memory/market `_checkCapabilitySafe` variants. 7 implementations of one concept; drift is how the safe-by-default gap happened. Should collapse to one chain (pipeline) with thin per-module adapters. |
| B-3 | **Facade exists but is bypassed** | `lib/vant.js` exposes `brain`/`storage` getters (the intended OS surface) and `lib/api.js` wraps execute+hooks — yet 73 files deep-`require('./brain')` and 22 lazy-require null-guards exist purely to dodge circular deps. Module graph is flat-and-tangled instead of layered (facade → services). |
| B-4 | **Dual mode — CORRECTED 2026-09-20: not legacy** | Investigation shows `dual` is the multibrain-aware READ-SIDE search policy: it checks the current brain first, then falls back through the stack. It does NOT mean "one brain" — the stack is fully active underneath. `public`/`private`/`remote` restrict WHERE loads look. Keep as-is; per-brain overrides already exist (`_brainFrameworkConfigs`). No deprecation needed. |
| B-5 | **Hardcoded versions — display instances FIXED 2026-09-20** | 18 hand-typed `'0.8.6'` strings in `getLayerStatus` display objects now read `require('./version')`. Horcrux metadata `'0.8.6'` deliberately remains: it is a FORMAT version contract, not a package version. Remaining literal sites are format-related. |
| B-6 | **Hardcoded brain paths** | brain.js pins `'models/private'`/`'models/public'` in 6+ places; some ignore `config.get('storage.path')` (e.g. geometryPath, basePath fallbacks). Multibrain path resolution should come from one config-driven resolver. |
| B-7 | **Error class split — RESOLVED 2026-09-20, mostly cosmetic** | Investigation showed `errors.Error` IS `VantError` (backwards-compat alias at error.js:305) — the 138/110 split was naming only, no behavioral difference. The 11 raw `throw new Error` sites (which bypassed codes/retryable metadata) are now VantError with proper codes. No further migration needed. |
| B-8 | **87 hand-copied `getLayerStatus` objects** | Every module hand-writes `{ name, type, version, enabled }`. One `status(name, type, opts)` helper in event.js/health.js removes ~87 copies and the version drift (see B-5). |

## C. Lifecycle & hygiene

| # | Finding | Detail |
|---|---------|--------|
| C-1 | **9 `setInterval`s, no unified lifecycle — FIXED 2026-09-20** | boot.js now owns a timer registry: `registerTimer(name, fn, ms, {unref})` / `unregisterTimer` / `stopAllTimers` / `getTimers`; `reset()` stops everything (shutdown path). All 8 bare `setInterval` sites migrated: `brain.metabolize`, `context.heartbeat`, `cron.<taskId>` (schedule holds the registry name as a marker), `stream.leaseSweep`, `sudo.revalidate`, `encounter.<id>`, `watch.<n>`, `zen.<n>` (per-instance names for classes). Every module falls back to bare setInterval if boot is unavailable (lazy-require guard — no new cycle risk). |
| C-2 | **307 `console.*` in lib/** | Where `audit` exists, console.log/warn/error should route through it (keeps structured events + lets CI capture). |
| C-3 | **242 ad-hoc event names** | Mostly well-namespaced (`agent:*`, `sudo:*`, `api:*`), but emitted as raw strings at each site. An `EVENTS` constants module would prevent typos and document the contract. |
| C-4 | **Dead exports** | ~150 zero-consumer exports cataloged in `labs/DEAD_EXPORTS.md` — removal process documented there. Notable suspects: `teams.js` (23 dead exports — possibly an unfinished feature), vaf sanitizers (`sanitizeHTML`/`sanitizeSQL`), error.js helpers. Verify stubs vs. dead before deleting (per your note). |

## D. Stubs to verify (may be "dead ends" you mentioned)

- `islands.js` lazy islands (github/gitlab/bitbucket/linear) load from storage keys — confirm any provider actually populates them, or they're always-empty shells.
- `sync.js` `pullAny()` / `rebase()` — audit P2-23/24 said "implement actual pull/merge"; check current state.
- `consensus.js` crypto helpers (`_signVote`, `_encryptBallot`) — exported but unreferenced; stubs?
- `watch.js` `EntropicRecovery`/`createSpring` — self-referential system or dead experimental code?
- `evolution` island handler (audit P3-31: "implement") — verify.

## Suggested sequencing (when we start)

1. **A-1** (backup completeness) — small fix, huge correctness win.
2. **B-7 + B-5 + B-8** — mechanical, low-risk convention unification (one commit per pattern, suite after each).
3. **C-1** (timer registry) — small, prevents leaks.
4. **B-2** (one security chain) — the structural one; do with the sudo PRD in hand.
5. **B-1/B-3** (fs→storage, facade layering) — biggest lift; needs a per-module migration order.
6. **B-4** (dual→multibrain semantics) — design decision first, then mechanical.
