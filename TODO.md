# TODO - Working Space

*Temp file for tracking work in progress. Not for Vant OS.*

---

## 2026-07-05: Architecture Audit Results

### Overlaps Found

| Collision | Modules | Issue |
|-----------|---------|-------|
| Context | auth ↔ habitat | Duplicate user context |
| Capabilities | sandbox ↔ rls | Two capability systems |
| Persistence | brain ↔ habitat | Duplicate save/restore |
| Security | escrow ↔ rls ↔ legal | Triple security check |
| Islands | islands ↔ habitat | No workspace isolation |

### What to Fix

| Priority | Action |
|----------|--------|
| HIGH | habitat.context() wraps auth.verifyToken() |
| HIGH | rls.createSandboxCaps() is source of truth for sandbox |
| MEDIUM | Abstract persistence (don't couple to brain) |
| MEDIUM | Document security pipeline: RLS → LEGAL → ESCROW |

---

## Next

- [ ] 
- [ ] 

---

*Last updated: 2026-07-05*
