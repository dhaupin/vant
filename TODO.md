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

## 2026-07-06: New Plan

### Goals

1. **Wire legal.js into security pipeline** (or document why dormant)
2. **Document security pipeline order** (RLS → VAF → Escrow → Legal?)
3. **Create headless REST API** for habitat/workspace management
4. **Add escrow async tests** (critical path)
5. **Fix auth ↔ habitat context** (or document single source)

### Security Pipeline (to implement)

```
Request → sandbox (caps) → rls (workspace) → vaf (validate) → escrow (budget) → legal (compliance)
```

---

## Commit Log

### vant (headless)

- 9c90ed5 - refactor: Consolidate cap generation
- 6a353d3 - fix: Wire sandbox.initRLS into vant boot
- e299004 - feat: Connect nature to encrypt entropy, sandbox as RLS carrier

### mycelium (main)

- ef6f02e - chore: Update TODO - cap gen consolidated
- 379323b - chore: Update TODO - fix vant boot wiring

---

*Last updated: 2026-07-06*
