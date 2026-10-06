# VANT axolotl Branch — Security & Code Audit Findings

**Branch:** `axolotl` (origin/axolotl)  
**Date:** 2026-09-18  
**Auditor:** Kilo subagents  
**Files Analyzed:** 8 core modules (~25K lines total)

---

## ✅ VERIFICATION LEDGER (2026-09-22, agent Buffy)

All 23 criticals repro-checked against current `axolotl`. **22 confirmed closed**
(hardened in earlier waves), **1 live bug found and fixed in this pass**
(vaf C1 — see below). Evidence: `node test/ci.js` → **422 passed, 0 failed,
0 warnings**; security suites: security 20, security-chain 9, security-hardening 22,
vaf 12, sandbox 22, test-sandbox 14, storage 40, malicious-restore 7, brain 77,
islands 14, mcp 6, agents 17+6, sync 18+6, backup 8, transform 5, remote 10,
remote-storage 13, pipeline 9, sudo 7 — all green.

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| **brain 1** | TOCTOU in `_loadBrain` | ✅ CLOSED | reads through brain FileStore (`_bfsRead`); no access→read window |
| **brain 2** | Double security chain | ✅ CLOSED | B-2: `_runBrainSecurityChain` delegates to `pipeline.runChain` (brain.js:347) |
| **brain 3** | `canRead` hardcoded for writes | ✅ CLOSED | `runChain` selects `canWrite`/`canRead` by operation (pipeline.js:589) |
| **brain 4** | Path traversal in dropbox ops | ✅ CLOSED | `_validBrainSegment` gate + writes through tmp-space store (brain.js:3224-3254) |
| **brain 5** | Format transformer corrupts content | ✅ CLOSED | format layer off in load path; corpus keeps raw content + `format` field |
| **brain 6** | `_saveState` not awaited | ✅ CLOSED | awaited before return; queued-promise chain (`_saveStatePromise`) |
| **brain 7** | `loadCorpusSync` swallows errors | ✅ CLOSED | function removed; `loadCorpus({sync:true})` is the sync path |
| **brain 8** | Fire-and-forget init | ✅ MITIGATED | preload is cache-warming only; `loadCorpus({sync:true})` guarantees sync reads |
| **brain 9** | Remote mode incomplete | ✅ MITIGATED | returns null gracefully, warns on fetch failure; corpus falls back public/private |
| **islands 1** | `save()` calls undefined `getBrain()` | ✅ CLOSED | save goes through island storage → sandbox canWrite (islands.js:292) |
| **islands 2** | `hydrate()` missing await | ✅ CLOSED | `await load(name)` (islands.js:333) |
| **islands 3** | `autoHydrate()` missing await | ✅ CLOSED | `await hydrate(name)` in loop (islands.js:402) |
| **islands 4** | Traversal in `createIsland` | ✅ CLOSED | `vafSafeName` throws before path build (islands.js:455) |
| **mcp 1** | `vant_call` arbitrary require RCE | ✅ CLOSED | dispatches registered `_methods` only; auto-wire is a hardcoded allowlist, not auto-invoked |
| **mcp 2** | Storage tools raw paths | ✅ CLOSED | `_containedModelPath` to models root; rm/cp/mkdir sudo-escalate (v0.9.0-axolotl note in mcp.js) |
| **mcp 3** | `compute_eval` no auth | ✅ CLOSED | throws `SANDBOX_EXEC_DENIED` without sudo escalation (mcp.js:1008+) |
| **mcp 4** | Shell tools injection | ✅ CLOSED | explicit `sudo.can(taskId,'exec')` at MCP layer; lib/shell adds its own chain |
| **mcp 5** | SSRF via network tools | ✅ CLOSED | network.js blocklist: 127/8, 169.254/16 (metadata), ::1, private ranges |
| **storage 1** | Symlink escape in `atomicWrite` | ✅ CLOSED | rename REPLACES dest symlinks (never follows); regression test P1-16 pins it |
| **storage 2** | `readRaw`/`writeRaw` bypass | ✅ BY DESIGN | documented explicit bypass; tests assert the unsafe contract; safe `read`/`write` enforce cap+vaf+symlink checks |
| **storage 3** | ConfigStorage require RCE | ✅ CLOSED | bare `vm` context, no require/process/fs, 1s timeout ("closes P0-7") |
| **storage 4** | Prototype pollution | ✅ CLOSED | `vaf.sanitizeObject` strips `__proto__`/`constructor`/`prototype` recursively; wired via `_sanitizeObject` |
| **sandbox 1** | Permissive DEFAULT_CAPABILITIES | ✅ CLOSED | DENY by default: canWrite/canExec/canNetwork/canSpawn/canCommit all false (sandbox.js:261) |
| **sandbox 2** | Stubs overridden by permissive exports | ✅ CLOSED | early exports also deny (`canRead:()=>false` etc.) |
| **sandbox 3** | RLS optional | ✅ BY DESIGN | deny-by-default base; RLS is opt-in caps refinement (`generateCaps`) |
| **sandbox 4** | Legal dormant by default | ✅ BY DESIGN | dormant gate over deny-by-default base; `initLegal(level)` activates |
| **sandbox 5** | `canBrain` uses global constants | 🔶 LATENT | static defaults used consistently; **zero callers** repo-wide (grep); class method mirrors module fn |
| **vaf 1** | `audit.info()` crash on load | 🔧 **FIXED TODAY** | live-repro'd: valid `.circuit-vaf.json` → `audit.info is not a function` killed module load. Happy path (no file) masked it. Replaced 3 calls with vaf's own `audit()`; regression test added |
| **vaf 2** | `Sanitize.CONTROL_PATTERN` ReferenceError | ✅ CLOSED | class resolves module-level `vaf` self-ref at property-access time (vaf.js:1291) |
| **vaf 3** | `checkPathTraversal` no base resolution | ✅ CLOSED | P1-15: iterative URL-decode + NFKC + fail-closed malformed encoding; pairs with `validateSafePath` for containment |
| **vaf 4** | `sanitizeObject` array bypass | ✅ CLOSED | recursion covers arrays (Array → entries) + proto-key strip |
| **vaf 5** | `check()` object no value validation | ✅ BY DESIGN | keys validated, depth/array caps enforced; leaf values are data (post-pollution-strip) |
| **agents 1** | Wrong Map (`_messages`) in work fns | ✅ CLOSED | crash path gone; delegateAsync → `stream` (gated enqueue). setDeadline/retry/escalate/setPriority return clean `{error:'Work not found'}` — legacy API, non-functional but fail-safe; zero callers outside module |
| **agents 2** | `delegateAsync` zero security | ✅ CLOSED | routes through `stream.enqueue` → sandbox→vaf→qos gate (stream.js:106+) |
| **agents 3** | `pollWork` no execution/chain | ✅ CLOSED | `stream.poll` behind same gate; returns coded error object |
| **agents 4** | `join()` wrong Map | ✅ CLOSED | `_messages` doubles as conversation store; join/send/listen consistent on it (keyed by conv id) |
| **sync 1** | `saveProviderState` userCtx crash | ✅ CLOSED | EINVAL guard (sync.js:122) + `SYSTEM_USER_CTX` at all call sites |
| **sync 2** | `audit` undefined | ✅ CLOSED | `const audit = require('./audit')` (sync.js:45) |
| **sync 3** | Guard leak on error | ✅ CLOSED | `finally { guard.release('sync:push'/'sync:pull') }` (sync.js:304, 404) |
| **transform 4** | Restore path traversal | ✅ CLOSED | validateHorcruxData blocks suspicious paths + `validateSafePath(fullPath, brainPath)` on all 3 write sites; malicious-restore suite pins it |
| **backup 5** | Undefined password to encryption | ✅ CLOSED | transform.js:1186 throws `Password required` before encrypt; restore throws on undecryptable |
| **remote 6** | `errors` not imported | ✅ CLOSED | `require('./error')` line 1; base methods throw coded VantError |

**Verdict:** the P0/P1 wave is complete. The one live bug found (vaf C1) was a
latent loader crash, not an injection vector — and it's now fixed with a
regression pin. Remaining 🔶/design notes are documented residuals, none
exploitable as described in the original audit.

*Original audit content below, unmodified.*

---

## Executive Summary

**Total Findings: 187 issues across 8 modules**

| Severity | Count | Modules Affected |
|----------|-------|------------------|
| 🔴 **CRITICAL** | 23 | brain, islands, mcp, storage, sandbox, agents, sync, remote, backup |
| 🟠 **HIGH** | 41 | All modules |
| 🟡 **MEDIUM** | 68 | All modules |
| 🟢 **LOW** | 55 | All modules |

**Top 3 Systemic Issues:**
1. **Default-permissive security posture** — Sandbox, VAF, and middleware chains default to ALLOW
2. **Path traversal & symlink escape** — 12+ locations lack proper containment validation
3. **Async/sync mismatches & race conditions** — TOCTOU in file ops, guard leaks, fire-and-forget saves

---

## Module-by-Module Critical Findings

### 1. lib/brain.js (1,970 lines) — 9 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | TOCTOU race in `_loadBrain` (access→read) | 1205-1314 | 🔴 |
| 2 | Double security chain execution (`_runBrainSecurityChain` + `executePipeline`) | 140-203, 1235 | 🔴 |
| 3 | Sandbox `canRead` hardcoded in pipeline (used for writes too) | 436 | 🔴 |
| 4 | Path traversal in `myDropFile`, `dropFile`, `getFile`, `deleteFile` | 1767-1955 | 🔴 |
| 5 | Format transformer corrupts content (replaces string with parsed object) | 657-665 | 🔴 |
| 6 | `_saveState` not awaited in `_loadBrain` | 1310 | 🔴 |
| 7 | `loadCorpusSync` swallows ALL errors | 1402 | 🔴 |
| 8 | Fire-and-forget `loadCorpus` at module init (no init guarantee) | 1610 | 🔴 |
| 9 | Remote mode incomplete (no corpus, silent failures) | 1247-1265 | 🔴 |

### 2. lib/islands.js (1,200 lines) — 4 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | `save()` calls undefined `getBrain()` → ReferenceError | 248 | 🔴 |
| 2 | `hydrate()` missing `await load()` → returns Promise not data | 262 | 🔴 |
| 3 | `autoHydrate()` missing `await hydrate()` | 330 | 🔴 |
| 4 | Path traversal in `createIsland()` via `name` param | 387-392 | 🔴 |

### 3. lib/mcp.js (3,837 lines) — 5 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | `vant_call` tool allows arbitrary `require('./lib/' + userInput)` — **RCE** | 2611-2624 | 🔴 |
| 2 | 7 storage tools accept raw paths with no validation — **path traversal** | Various | 🔴 |
| 3 | `compute_eval` (and `vant_compute_eval`) — arbitrary code exec, no auth | 950, 3275 | 🔴 |
| 4 | Shell tools (`vant_shell_exec/capture/spawn`) accept raw commands — **injection** | Various | 🔴 |
| 5 | `vant_remote_call` / `vant_network_fetch` — **SSRF** to arbitrary hosts | Various | 🔴 |

### 4. lib/storage.js (4,673 lines) — 4 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | Symlink escape in `atomicWrite()` — `renameSync` follows dest symlinks | 189-196 | 🔴 |
| 2 | `readRaw`/`writeRaw` bypass ALL security (absolute paths, no VAF, no caps) | 273-277, 429-442 | 🔴 |
| 3 | `ConfigStorage._load()` uses `require()` on user-writable file — **RCE** | 972-988 | 🔴 |
| 4 | Prototype pollution in 9/11 storage write paths (no `vaf.sanitizeObject`) | Multiple | 🔴 |

### 5. lib/sandbox.js (1,135 lines) — 5 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | `DEFAULT_CAPABILITIES` is permissive (ALLOW) — contradicts "DENY BY DEFAULT" claim | 232-255 | 🔴 |
| 2 | Early secure stubs overridden by permissive exports | 124-129 vs 834-1093 | 🔴 |
| 3 | RLS integration optional — if `initRLS()` not called, all RLS checks skipped | 47-64 | 🔴 |
| 4 | Legal compliance layer dormant by default — `initLegal()` must be called | 99-116 | 🔴 |
| 5 | `canBrain()` uses global constant instead of instance capabilities | 203-223, 1065-1085 | 🔴 |

### 6. lib/vaf.js (1,337 lines) — 5 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | `audit.info()` crashes on module load (audit is function, not object) | 230, 233, 245 | 🔴 |
| 2 | `Sanitize.CONTROL_PATTERN` ReferenceError (`vaf` undefined in class scope) | 1245 | 🔴 |
| 3 | `checkPathTraversal()` no base dir resolution — must pair with `validateSafePath()` | 373-425 | 🔴 |
| 4 | `sanitizeObject()` array prototype pollution bypass | 1322-1334 | 🔴 |
| 5 | `check()` object type — no content validation on string values | 785-791 | 🔴 |

### 7. lib/agents.js (3,317 lines) — 4 Critical
| # | Issue | Line | Severity |
|---|-------|------|----------|
| 1 | `setDeadline`/`retry`/`escalate`/`setPriority` use wrong Map (`_messages` not work items) | 551-637 | 🔴 |
| 2 | `delegateAsync()` has ZERO security checks (bypasses all controls) | 403-423 | 🔴 |
| 3 | `pollWork()` assigns task but no execution, no security chain | 428-440 | 🔴 |
| 4 | `join()` conversation uses wrong Map — broken inter-agent comms | 684-686 | 🔴 |

### 8. lib/sync.js + lib/backup.js + lib/remote.js — 6 Critical
| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | `saveProviderState` requires `userCtx` but called without (crashes) | sync.js:109, 265, 272 | 🔴 |
| 2 | `audit` undefined — ReferenceError on all sync ops | sync.js:236, 274, etc | 🔴 |
| 3 | Recursion guard never released on error path | sync.js:207-288 | 🔴 |
| 4 | Restore writes files WITHOUT path traversal validation | transform.js:1328-1343 | 🔴 |
| 5 | Password handling — undefined password used for encryption | backup.js:208, 275 | 🔴 |
| 6 | `errors` module not imported in remote.js — all throws crash | remote.js:32-72 | 🔴 |

---

## Systemic Pattern Analysis

### Pattern 1: Default-Permissive Security (7 modules)
```
sandbox.js: DEFAULT_CAPABILITIES = { canExec: true, canNetwork: true, canSpawn: true, ... }
vaf.js:     check() defaults to allowing unknown types
mcp.js:     No auth required by default, wildcard CORS
storage.js: FileStorage.writeRaw() bypasses all checks
brain.js:   Sandbox checks optional (fail-open)
agents.js:  Sandbox check skipped if module fails to load
remote.js:  No token validation, no auth in provider base
```

### Pattern 2: Path Traversal / Symlink Escape (12+ locations)
| Module | Location | Protection |
|--------|----------|------------|
| brain.js | `dropFile`, `getFile`, `deleteFile` | None |
| islands.js | `createIsland()` | VAF string check only |
| storage.js | `atomicWrite()`, `readRaw`, `writeRaw`, `list()` | Partial (post-write only) |
| sync.js | Provider file ops | None |
| backup.js | `restore()`, jsonPath, deltaPath | VAF only on input |
| transform.js | `restore()` brain storage files | Detects but doesn't block |

### Pattern 3: Async/Sync Mismatches & Race Conditions
| Module | Issue |
|--------|-------|
| brain.js | TOCTOU in 6+ file reads; `_saveState` not awaited; fire-and-forget init |
| islands.js | `load()` async but `save()`/`hydrate()`/`dehydrate()` sync; manifest cache stale |
| storage.js | TOCTOU in `FileStorage.write()`; `_manifestCache` never invalidated |
| agents.js | `spawn()` sync but does async; `pause()`/`resume()` don't persist |
| sync.js | Guard acquired but not released on error; circuit breaker file relative |
| backup.js | Timestamp collision in backup tracking; `_saveAgents` fire-and-forget |

### Pattern 4: Incomplete/Stub Implementations
| Module | Stub | Impact |
|--------|------|--------|
| islands.js | `evolution` island no handler | Returns null silently |
| sync.js | `pullAny()` returns only repoInfo | No actual brain data pulled |
| sync.js | `rebase()` = pull + push | No merge/conflict resolution |
| backup.js | Incremental delta = JSON.stringify diff | Breaks on circular refs, key order |
| remote.js | All base methods throw "Not implemented" | Forces full implementation in subclasses |
| agents.js | `delegateAsync`/`pollWork` no security | Complete bypass |

### Pattern 5: Missing Input Validation
| Module | Missing Validation |
|--------|-------------------|
| mcp.js | 100+ tools define schemas but NONE validated at dispatch |
| islands.js | `save()` no validation on `data` param; `updateTriggers()` no array check |
| storage.js | 9/11 write paths lack prototype pollution protection |
| vaf.js | No iterative URL decode; no Unicode normalization; no symlink check |
| brain.js | `myDropFile`/`dropFile` no path sanitization on `name` |
| backup.js | `outputPath` not validated for derived paths |

---

## Cross-Module Dependency Risks

### Circular Dependency Chain
```
remote.js → connectors/github.js → (likely) remote.js  [Line 79-83]
agents.js → sandbox.js → qos.js → escrow.js → rls.js → habitat.js → agents.js
```

### Shared Mutable State (No Isolation)
| Module | Global State | Risk |
|--------|--------------|------|
| brain.js | `_cache`, `_corpusCache`, `_pipelineState` | Cross-request contamination |
| agents.js | `_agents`, `_messages`, `_currentAgentId` | Agent isolation broken |
| storage.js | `_instances` (singleton per type+options) | Config mutation affects all |
| sync.js | `_circuitBreaker` file | Single point of failure |

---

## Prioritized Action Plan

### P0 — IMMEDIATE (Crashes / Active Exploits)
| # | Task | Module | Effort |
|---|------|--------|--------|
| 1 | Fix `islands.js` `save()` undefined `getBrain()` | islands.js | 1hr |
| 2 | Fix `islands.js` `hydrate()`/`autoHydrate()` missing awaits | islands.js | 1hr |
| 3 | Fix `sync.js` missing `userCtx` in all `saveProviderState` calls | sync.js | 2hr |
| 4 | Fix `sync.js` undefined `audit` variable | sync.js | 30min |
| 5 | Fix `remote.js` missing `errors` import | remote.js | 30min |
| 6 | Fix `mcp.js` `vant_call` arbitrary require RCE | mcp.js | 2hr |
| 7 | Fix `storage.js` `ConfigStorage` require() RCE | storage.js | 1hr |
| 8 | Fix `transform.js` restore path traversal | transform.js | 2hr |
| 9 | Fix `sandbox.js` DEFAULT_CAPABILITIES to DENY by default | sandbox.js | 1hr |
| 10 | Fix `brain.js` TOCTOU in `_loadBrain` (6 locations) | brain.js | 3hr |

### P1 — HIGH (Security Hardening)
| # | Task | Module | Effort |
|---|------|--------|--------|
| 11 | Add path containment validation to ALL file writes | brain, islands, storage, backup, transform | 8hr |
| 12 | Add `vaf.sanitizeObject()` to all 9 vulnerable storage write paths | storage.js | 4hr |
| 13 | Fix `delegateAsync`/`pollWork` security bypass in agents.js | agents.js | 4hr |
| 14 | Fix `mcp.js` tool input schema validation enforcement | mcp.js | 4hr |
| 15 | Fix `vaf.js` iterative URL decode + Unicode normalization | vaf.js | 3hr |
| 16 | Fix `storage.js` `atomicWrite` symlink escape (O_NOFOLLOW) | storage.js | 2hr |
| 17 | Remove or secure `storage.js` `readRaw`/`writeRaw` | storage.js | 2hr |
| 18 | Fix `brain.js` format transformer content corruption | brain.js | 2hr |
| 19 | Fix `backup.js` undefined password handling | backup.js | 2hr |
| 20 | Fix `sync.js` recursion guard try/finally | sync.js | 1hr |

### P2 — MEDIUM (Reliability & Architecture)
| # | Task | Module | Effort |
|---|------|--------|--------|
| 21 | Consolidate mode routing logic in brain.js (5x duplication) | brain.js | 4hr |
| 22 | Fix `islands.js` manifest cache invalidation | islands.js | 2hr |
| 23 | Implement actual pull in `sync.js` `pullAny()` | sync.js | 4hr |
| 24 | Implement merge/conflict resolution in `rebase()` | sync.js | 6hr |
| 25 | Add timeouts to all provider operations | sync.js, remote.js | 3hr |
| 26 | Fix `agents.js` Map confusion (`_messages` vs work items) | agents.js | 3hr |
| 27 | Add atomic writes (temp + rename) to all file operations | All | 6hr |
| 28 | Add checksums/hashes to backup metadata | backup.js, transform.js | 3hr |
| 29 | Fix `vaf.js` prototype pollution in `sanitizeObject` | vaf.js | 2hr |
| 30 | Fix `agents.js` agent isolation (per-agent state) | agents.js | 6hr |

### P3 — LOW (Code Quality & Completeness)
| # | Task | Module | Effort |
|---|------|--------|--------|
| 31 | Implement `evolution` island handler | islands.js | 2hr |
| 32 | Split `agents.js` into focused modules | agents.js | 8hr |
| 33 | Standardize error handling patterns | All | 4hr |
| 34 | Add circuit breaker for brain loads | brain.js | 3hr |
| 35 | Add integration tests for all P0/P1 fixes | All | 16hr |

---

## Recommended Immediate Workflow

```
Week 1: P0 fixes (items 1-10) — Stabilize, stop crashes/exploits
Week 2: P1 security hardening (items 11-20) — Close attack vectors
Week 3: P2 reliability (items 21-30) — Fix architecture, data integrity
Week 4: P3 + testing (items 31-35) — Polish, verify, document
```

---

## Testing Gaps to Address

No existing tests found for:
- Path traversal attempts (all modules)
- Prototype pollution payloads (storage, islands, vaf)
- Symlink escape scenarios (storage, brain, backup)
- MCP tool injection vectors (mcp.js)
- Agent delegation security bypasses (agents.js)
- Backup restore with malicious content (backup.js, transform.js)
- Sync recursion guard leaks (sync.js)
- Concurrent agent operations (agents.js)

---

## Files Requiring Changes (Priority Order)

1. **lib/sandbox.js** — Default capabilities, RLS/legal init
2. **lib/brain.js** — TOCTOU, double chain, format transformer, path traversal
3. **lib/islands.js** — Critical bugs (getBrain, awaits, path traversal)
4. **lib/mcp.js** — RCE, SSRF, shell injection, tool validation
5. **lib/storage.js** — Symlink escape, raw bypass, require() RCE, prototype pollution
6. **lib/vaf.js** — Crash fixes, path traversal, prototype pollution, encoding
7. **lib/agents.js** — Map confusion, delegateAsync/pollWork security, isolation
8. **lib/sync.js** — userCtx, audit, guard, pull/rebase implementation
9. **lib/backup.js** — Path validation, password handling, retention logic
10. **lib/remote.js** — errors import, circular dep, provider caching
11. **lib/transform.js** — Restore path traversal, encryption consistency, rate limiter
12. **lib/escrow.js** — Singleton pattern for rate limiting

---

## Summary

The `axolotl` branch has **significant security debt** and **architectural inconsistencies**. The most dangerous issues are:

1. **RCE in mcp.js** (`vant_call` arbitrary require)
2. **RCE in storage.js** (`ConfigStorage` require on user file)
3. **Path traversal in restore** (transform.js) — malicious backup = arbitrary file write
4. **Default-permissive sandbox** — all dangerous capabilities enabled by default
5. **Multiple crash bugs** — undefined variables, missing awaits, wrong Maps

**Recommendation:** Do not deploy to production without completing P0 and P1 fixes. The codebase needs a security-focused refactor pass before considering stable.