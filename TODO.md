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

## Next

- [ ] Map geometry → workspaces (spatial addressing)
- [ ] Integrate lineage with workspace tracking
- [ ] Wire habitat into vant.js boot
- [ ] Test RLS in sandbox

---

*Last updated: 2026-07-05*
