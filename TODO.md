# TODO - Working Space

*Temp file for tracking work in progress. Not for Vant OS.*

---

## 2026-07-06: Audit Findings

### Symbiosis Status ✅

| Area | Status | Notes |
|------|--------|-------|
| sandbox ↔ rls caps | ✅ RESOLVED | sandbox.generateCaps is single source |
| vant.js → sandbox.initRLS | ✅ DONE | Wired in boot |
| habitat → nature → encrypt | ✅ DONE | feedCosmicEntropy connected |
| Circular deps | ✅ CLEAN | All 65 modules load OK |

### Overlaps Remaining

| Collision | Modules | Issue | Priority |
|-----------|---------|-------|----------|
| Context | auth ↔ habitat | Duplicate user context | MEDIUM |
| Persistence | brain ↔ habitat | Both have save/restore | LOW |
| Security | escrow ↔ rls ↔ legal | Triple check, unclear order | MEDIUM |

### Audit Gaps Found

- `legal.js` is DORMANT - not wired into security pipeline
- `vaf.js` is used in sandbox but unclear if it's in critical path
- No headless REST API for habitat (missing UX)
- No test coverage for escrow async operations

---

## Random Tasks (from audit)

- [x] Wire legal.js into security pipeline
- [x] Clarify vaf.js role in security pipeline
- [ ] Create headless REST API for habitat
- [x] Add escrow async tests
- [x] Check other module overlaps (escrow, lineage, brain, islands)
- [x] Verify export consistency across modules
- [x] Complete security pipeline wiring
- [x] Check for circular dependencies
- [x] Fill test coverage gaps (added escrow tests)

---

## 2026-07-06: New Plan

### Goals

1. **Wire legal.js into security pipeline** (or document why dormant)
2. **Document security pipeline order** (RLS → VAF → Escrow → Legal?)
3. **Create headless REST API** for habitat/workspace management
4. **Add escrow async tests** (critical path)
5. **Fix auth ↔ habitat context** (or document single source)

### Security Pipeline (IMPLEMENTED ✅)

```
Request → sandbox.execute()
            │
            ├── 1. VAF (sanitize input)
            ├── 2. RLS (workspace/role caps via generateCaps)
            ├── 3. Escrow (budget check)
            └── 4. Legal (compliance check - if activated)
```

**Wired in vant.js boot:**
- `sandbox.initRLS(habitat)` - RLS carrier
- `sandbox.initLegal('warn')` - Legal gate (dormant by default)

---

## Commit Log

### vant (headless)

- ed5218e - test: Add escrow async tests
- 27b69ea - feat: Wire security pipeline - VAF → RLS → Escrow → Legal
- 9c90ed5 - refactor: Consolidate cap generation
- 6a353d3 - fix: Wire sandbox.initRLS into vant boot
- e299004 - feat: Connect nature to encrypt entropy, sandbox as RLS carrier

### mycelium (main)

- ef6f02e - chore: Update TODO - cap gen consolidated
- 379323b - chore: Update TODO - fix vant boot wiring

---

*Last updated: 2026-07-06*
