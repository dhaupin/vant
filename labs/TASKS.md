# Vant Labs — Session Task Tracker

**Branch:** axolotl  
**Last Updated:** 2026-09-19  
**Session:** Security audit + fixes on axolotl branch

---

## Session Summary

**Objective:** Security audit and hardening of Vant axolotl branch  
**Approach:** Subagent-based exploration → targeted fixes → verification  
**Result:** 38 fixes applied, all core tests passing, defense-in-depth security posture achieved

---

## Phase Completion Status

### ✅ P0 — Critical Crashes/Exploits (10/10)
| # | Fix | Status |
|---|-----|--------|
| P0-1 | islands.js `save()` undefined `getBrain()` → `Storage.get('island')` | ✅ |
| P0-2 | islands.js `hydrate()`/`autoHydrate()` missing `await` | ✅ |
| P0-3 | sync.js missing `userCtx` in `saveProviderState` calls | ✅ |
| P0-4 | sync.js undefined `audit` variable | ✅ |
| P0-5 | remote.js missing `errors` import | ✅ |
| P0-6 | mcp.js `vant_call` arbitrary `require()` RCE | ✅ |
| P0-7 | storage.js `ConfigStorage` `require()` RCE | ✅ |
| P0-8 | transform.js restore path traversal | ✅ |
| P0-9 | sandbox.js `DEFAULT_CAPABILITIES` DENY by default | ✅ |
| P0-10 | brain.js TOCTOU (14 locations) | ✅ |

### ✅ P1 — High Security Hardening (10/10)
| # | Fix | Status |
|---|-----|--------|
| P1-11 | Path containment validation all file writes | ✅ |
| P1-12 | `vaf.sanitizeObject()` 10 storage write paths | ✅ |
| P1-13 | agents.js `delegateAsync`/`pollWork` security + Map fix | ✅ |
| P1-14 | mcp.js tool input schema validation enforcement | ✅ |
| P1-15 | vaf.js iterative URL decode + Unicode normalization | ✅ |
| P1-16 | storage.js `atomicWrite` symlink escape (O_NOFOLLOW) | ✅ |
| P1-17 | storage.js `readRaw`/`writeRaw` REMOVED | ✅ |
| P1-18 | brain.js format transformer content corruption | ✅ |
| P1-19 | backup.js password handling | ✅ |
| P1-20 | sync.js recursion guard try/finally | ✅ |

### ✅ P1.5 — Runtime Capability Alignment (4/4)
| # | Fix | Status |
|---|-----|--------|
| Boot scopes | `['read', 'write', 'network', 'spawn', 'execute']` | ✅ |
| Sandbox/sudo defaults | Aligned to boot scopes | ✅ |
| Sandbox test | Updated for deny-by-default | ✅ |
| Revert | DENY BY DEFAULT for defense-in-depth | ✅ |

### ✅ P2 — Architecture/Reliability (10/10)
| # | Fix | Status |
|---|-----|--------|
| P2-1 | brain.js mode routing consolidation | ✅ |
| P2-2 | islands.js manifest cache invalidation | ✅ |
| P2-3 | sync.js actual pull implementation | ✅ |
| P2-4 | sync.js 3-way merge/conflict resolution | ✅ |
| P2-5 | Provider operation timeouts (30s) | ✅ |
| P2-6 | agents.js per-agent isolation (AgentContext) | ✅ |
| P2-7 | Atomic writes shared utility | ✅ |
| P2-8 | Backup SHA256 checksums | ✅ |
| P2-9 | vaf.js prototype pollution fix | ✅ |
| P2-10 | agents.js split into 6 modules | ✅ |

### ✅ Sudo System — Time-Based Escalation (1/1)
| Component | Status |
|-----------|--------|
| Whitelist policies (6 services) | ✅ |
| Escalation with TTL/auto-revalidate | ✅ |
| Revalidation loop (30s) | ✅ |
| Sandbox integration | ✅ |
| Boot integration | ✅ |

### ✅ Documentation (5/5)
| Doc | Status |
|-----|--------|
| labs/prd-sudo.md | ✅ |
| labs/prd-brain.md | ✅ |
| labs/prd-agents.md | ✅ |
| labs/prd-storage.md | ✅ |
| labs/prd-security.md | ✅ |

---

## Current Security Posture (Axolotl)

| Layer | Configuration |
|-------|---------------|
| **Sandbox** | Deny-by-default: only `read` allowed; 8 dangerous caps require sudo |
| **Boot** | Default scopes: `['read']` only |
| **Sudo** | Default scopes: `['read']` only; 7 service whitelist policies |
| **Escalation** | Time-bounded (TTL), auto-revalidate/revoke, audit trail |
| **Services** | All 7 core services integrated + 30+ modules migrated |

---

## P3 — Next Steps (Low Priority)

### Code Quality
- [ ] Standardize error handling patterns across modules
- [ ] Extract magic numbers to config (timeouts, limits, TTLs)
- [ ] Add JSDoc to all public APIs
- [ ] Fix lint/typecheck if configured
- [ ] Remove dead code (unused exports, dead branches)

### Testing
- [x] Add integration tests for sudo escalation flows
- [x] Add security tests: path traversal, prototype pollution, symlink escape
- [x] Add MCP tool injection tests
- [ ] Add concurrent agent operation tests
- [ ] Add backup restore with malicious content tests
- [ ] Add sync recursion guard leak tests
- [ ] Test coverage target: >80% for security-critical modules

### Sudo Integration (from prd-sudo.md)
- [x] Integrate sudo escalation in 7 core services:
  - [x] network.js — `network` scope before fetch
  - [x] storage.js — `write` scope before writes
  - [x] shell.js — add whitelist check for `exec`
  - [x] mcp.js — add `compute:eval` to whitelist
  - [x] agents.js — `spawn`/`write` escalation
  - [x] sync.js — `commit`/`createBranch` escalation
  - [x] brain.js — `write` escalation
- [x] Update 30+ modules to use `sandbox.can()` instead of direct `sandbox.canX()`
- [x] Update 17 modules with `_checkWrite/_checkNetwork/_checkExec` to escalate
- [x] Add 5 missing whitelist scopes: `commit`, `createBranch`, `compute:eval`, `delete`, `admin`

### Documentation
- [x] API reference for all public modules (AGENTS.md, DEPLOY.md, README.md)
- [x] Architecture decision records (ADRs) for major changes
- [x] Security model documentation (labs/prd-security.md)
- [x] Contribution guide for sudo whitelist modifications
- [x] Migration guide for deny-by-default

### Labs Expansion
- [x] labs/prd-brain.md — Brain architecture PRD
- [x] labs/prd-agents.md — Agent system PRD
- [x] labs/prd-storage.md — Storage layer PRD
- [x] labs/prd-security.md — Security model PRD
- [ ] labs/adr/*.md — Architecture Decision Records

---

## Quick Reference

### Key Files Modified
| Module | Key Changes |
|--------|-------------|
| `lib/sandbox.js` | DENY-by-default, sudo integration, taskId support |
| `lib/sudo.js` | Whitelist, escalation TTL, revalidation loop |
| `lib/boot.js` | Sudo escalation for boot privileges |
| `lib/brain.js` | Mode consolidation, TOCTOU fixes, format transformer |
| `lib/islands.js` | Async fixes, cache invalidation |
| `lib/sync.js` | Actual pull, 3-way merge, timeouts, guards |
| `lib/agents.js` | Split into 6 modules, per-agent isolation |
| `lib/storage.js` | Atomic writes, SHA256, prototype pollution, RCE fix |
| `lib/transform.js` | Path validation, checksums |
| `lib/backup.js` | Password handling, checksums |
| `lib/vaf.js` | Iterative decode, Unicode, prototype pollution |
| `lib/mcp.js` | RCE fixes, schema validation, sudo for tools |
| `lib/remote.js` | Circular dep fix, errors import |

### New Modules Created
- `lib/agent-internal.js`
- `lib/agent-lifecycle.js`
- `lib/agent-delegation.js`
- `lib/agent-workflow.js`
- `lib/agent-communication.js`
- `lib/agent-metrics.js`

### Test Commands
```bash
# Run all tests
npm test

# Key test files
node test/test-sandbox.js      # 14/14
node test/agents.test.js       # 17/17
node test/islands.test.js      # 14/14
node test/sync.test.js         # 18/18
node test/mcp.test.js          # 6/6
node test/transform.test.js    # 5/5
node test/vaf.test.js          # 11/11
node test/backup.test.js       # 8/8
node test/prune.test.js        # 10/10
node test/sudo.test.js         # 7/7
node test/boot.test.js         # 15/15
node test/sudo-integration.test.js  # 16/16
node test/security-hardening.test.js # 26/26
```

---

## Handoff Notes

- **Branch:** `axolotl` (pushed to origin)
- **All fixes committed and pushed**
- **All core tests passing** (500+ tests)
- **Production-ready** with defense-in-depth security
- **Labs docs** in `/labs` for future reference
- **Ready for P3** when next session begins