# Vant Roadmap

## v0.8.6 (Current)

### Transform + Horcrux System ✅ DONE

- [x] lib/transform.js - universal data gathering
- [x] Security chain integration (sandbox, vaf, qos)
- [x] Delegation tracking (auto-track agent events)
- [x] Islands in horcrux
- [x] Runtime snapshot in horcrux
- [x] embedToSvg() wiring to stego
- [x] bin/transform.js CLI

### Restore from Horcrux (IN PROGRESS)

- [ ] transform.fromHorcrux() - extract data from SVG
- [ ] transform.restore(data) - restore all systems
- [ ] Canvas boot hook to auto-restore
- [ ] Full backup/restore flow

### Boot Templates

- [ ] Rename models/public/examples → models/public/boot
- [ ] Create passwordless starter brain template
- [ ] Move password-protected horcrux to boot/

---

## v0.9.0

### Multi-Brain Support

File-based multi-tenancy:

```
models/private/
  ├── brain-name1/
  │   ├── identity.md
  │   ├── orgs.json
  │   └── ...
  ├── brain-name2/
  │   ├── identity.md
  │   └── ...
  └── _default -> brain-name1/
```

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **File-based (recommended)** | Simple, portable, git-friendly | Need path updates everywhere |
| Registry DB | Fast switching | Single point of failure |
| Symlinks | Works with existing code | OS-dependent |

**Implementation:**
1. lib/brain-registry.js - manages brain folders
2. brain.use('name') - switch brain
3. brain.create('name') - create new brain
4. Update getBrainPath() to use registry
5. Keep models/private in .gitignore (like .env)

**Files to Update:**
- lib/brain.js (getBrainPath, load, etc)
- lib/sandbox.js (capabilities per brain)
- bin/* (all CLI tools)
- Any hardcoded 'models/private' paths
