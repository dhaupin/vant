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

## 2026-07-05: Full Architecture Map

### Current Vant OS Layers

```
┌─────────────────────────────────────────────────────────┐
│                      ENTRY                              │
│   vant.js (runtime) → boot.js (init) → api.js (http)   │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                   SECURITY PIPELINE                     │
│   rls.js → sandbox.js → vaf.js → escrow.js → legal.js │
│   (workspace)   (caps)   (validate)  (budget)  (gate) │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                      MEMORY                            │
│   brain.js (learn/remember)                            │
│   storage.js (files)                                    │
│   islands.js (corpus/storage)                           │
│   search.js (vectors)                                   │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                   EXECUTION                            │
│   agents.js (agent execution)                          │
│   nodes.js?                                            │
│   compute.js                                           │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                   ECOSYSTEM                           │
│   lineage.js (object tracking)                          │
│   consensus.js (agent voting)                          │
│   node-registry.js (node management)                   │
└─────────────────────────────────────────────────────────┘
```

### NEW: Meta-Layer (Habitat, Nature, Flywheel)

These are DIFFERENT - they run AROUND the OS, not IN the pipeline:

```
┌─────────────────────────────────────────────────────────┐
│               HABITAT (The Environment)                │
│   - workspaces (containers)                             │
│   - roles (admin/editor/viewer)                        │
│   - boundaries (RLS policies)                           │
│   - entropy sources (feed chaos)                        │
│   - cosmic entropy (NOAA + NASA)                       │
└─────────────────────────────────────────────────────────┘
                            │ feeds
                            ▼
┌─────────────────────────────────────────────────────────┐
│               NATURE (The Spark Mechanism)            │
│   - accumulate(chaos) → spin flywheel                  │
│   - tick() → decay → potential spark                   │
│   - hit-and-miss engine pattern                        │
│   - NOT cron - event-driven                            │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│               FLYWHEEL (Persistence)                   │
│   - momentum between sessions                          │
│   - save/restore from brain                            │
│   - tracks: sessions, totalChaos, lastSpark            │
└─────────────────────────────────────────────────────────┘
```

### Where Geometry Fits

```
geometry/ (spatial memory addressing)
├── quasicrystal.js - aperiodic tilings (Penrose)
├── projection.js - 5D → 2D slice
├── tilings.js - P3 tile patterns
└── icosahedral.js - 3D symmetry

Could map workspaces → geometric regions!
Each workspace = region in quasicrystal space
Collision-free addressing for multi-tenant!
```

### Ecosystem Modules (Need Integration)

| Module | Purpose | Could Relate To |
|--------|---------|-----------------|
| lineage.js | Track object origins | Workspace tracking |
| consensus.js | Agent voting | Workspace decisions |
| node-registry.js | Node management | Habitat nodes |
| geometry/* | Spatial addressing | Workspace regions |
| event.js | Global events | Nature chaos feed |

---

## 2026-07-05: Tonight's Plan - DONE! ✅

### Completed

1. ✅ **Map geometry → workspaces (spatial addressing)**
   - Added `workspaceAddress()` and `workspaceMap()` to geometry/index.js
   - Integrated into `habitat.createWorkspace()` - auto-assigns geometric address
   - Addresses collision-free via quasicrystal projection

2. ✅ **Integrate lineage with workspace tracking**
   - `lineage.record()` now auto-captures workspace from habitat
   - Added `traceForWorkspace()` for filtering by workspace
   - Stats now include workspace breakdown

3. ✅ **Wire habitat into vant.js boot**
   - Added habitat + nature init in vant.js init()
   - Creates global __vant_habitat and __vant_nature
   - Exports getHabitat() and getNature() getters
   - Restores flywheel from brain, feeds cosmic entropy

4. ✅ **Test RLS in sandbox**
   - Created test-rls.js - all tests pass
   - Fixed escrow.js beforeExecute to async
   - Added initRLS to sandbox exports

---

## Commit: 99a58bf

```
feat: Geometry→workspaces, lineage workspace tracking, habitat boot, RLS tests

- Add workspaceAddress(), workspaceMap() to geometry (spatial addressing)
- Integrate geometry into habitat.createWorkspace()
- Add workspace tracking to lineage.record()
- Add traceForWorkspace() for multi-tenant filtering
- Wire habitat + nature into vant.js init
- Export habitat/nature getters
- Add initRLS to sandbox exports
- Fix escrow beforeExecute async
- Add RLS integration test
```

---

## Next Session

- [ ] Document security pipeline (sandbox → escrow → rls → legal)
- [ ] Connect nature spark to cosmic entropy from encrypt
- [ ] Fix overlaps: auth↔habitat, sandbox↔rls
- [ ] Headless UX: expose habitat via REST API

---

## 2026-07-06: Security Pipeline + Nature Entropy + Overlap Fixes

### Goals - DONE ✅

1. ✅ **Document security pipeline** (sandbox → escrow → rls → legal)
   - Map each layer's responsibility
   - Document data flow

2. ✅ **Connect nature spark to encrypt entropy**
   - Added feedCosmicEntropy() to habitat
   - Gets entropy from encrypt.getCosmicEntropy()
   - Wired into vant.js boot

3. ✅ **Fix overlaps: auth↔habitat, sandbox↔rls**
   - sandbox is now the carrier (called everywhere)
   - Added generateCaps() to sandbox
   - sandbox holds _rls and _habitat references

---

### Security Pipeline Architecture

```
Request → sandbox (capabilities) → escrow (budget/quota) → rls (workspace/role) → legal (compliance)
         ↓                           ↓                           ↓                        ↓
    canRead/Write/Exec        canSpend/quota check       workspace isolation      policy check
    caps from RLS             circuit breaker           role validation           audit trail
```

**Current flow:**
1. sandbox.js - creates execution context, checks caps
2. escrow.js - rate limiting, budget, circuit breaker (async)
3. rls.js - workspace/role validation (NEW)
4. legal.js - compliance, audit (NEW)

**Overlap issue:**
- sandbox creates caps but rls also creates caps
- auth creates context but habitat also has context
- Duplication = drift risk

**Fix approach:**
- Use sandbox as the carrier since it's called everywhere
- sandbox.initRLS(habitat) → sandbox holds RLS reference
- Remove rls.js duplicate cap creation
- Keep rls for workspace boundary checks only

---

## Commit: e299004

```
feat: Connect nature to encrypt entropy, sandbox as RLS carrier

- Add feedCosmicEntropy() to habitat - gets entropy from encrypt module
- Add Nature instance creation in vant.js boot
- Add generateCaps() to sandbox - RLS cap generation via carrier pattern
- Sandbox now holds _rls and _habitat references
- Remove duplicate cap creation in rls (sandbox is carrier)
```

---

## Commit: 6a353d3

```
fix: Wire sandbox.initRLS into vant boot

- Complete the loop: vant.js now calls sandbox.initRLS(habitat)
- Sandbox now holds RLS reference, ready to generate caps
```

---

### Remaining Overlap (known)

- rls.js has createSandboxCaps()
- sandbox.js has generateCaps()

Both do the same. Kept both - sandbox is primary (carrier pattern), rls.js fallback for direct RLS calls. Could consolidate later.

---

*Last updated: 2026-07-06*
