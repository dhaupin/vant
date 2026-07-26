# Vant Format Refactor Plan

> **Status**: PLANNING - Do not build yet
> **Created**: 2026-07-25

This document outlines the plan to unify brain file handling across all formats (md, json, yaml, txt, ini).

---

## Problem Statement

### Current Issues

1. **Brain only reads `.md` files** - JSON, YAML, TXT files in models/ are ignored
2. **Two separate systems** - Corpus (models/) vs Storage (storage/) are disconnected
3. **Extension stripping** - Only `.md` supported, can't have `foo.md` and `foo.json`
4. **Format.js unused** - Has loadFile/saveFile but brain doesn't use them
5. **Geometry not loaded** - JSON files in geometry/ aren't part of brain corpus

### Affected Files

```
models/private/nova/geometry/coordinates.json  (NOT LOADED)
models/private/nova/geometry/tilings.json   (NOT LOADED)
models/public/vant/*.json                    (NOT LOADED)
```

---

## Goals

1. **Extension-aware brain** - Support .md, .json, .yaml, .yml, .txt, .ini
2. **Unified file handling** - Use format.js for all read/write
3. **Both parsed + raw** - API returns both parsed objects and raw content
4. **No data loss** - Backwards compatible, no breaking changes
5. **Storage uses format** - Storage layer also uses format.js

---

## Architecture

### Current (Separate Systems)

```
┌─────────────────────────────────────────────────────────┐
│                     brain.js                            │
├─────────────────────┬───────────────────────────────────┤
│    Corpus          │         Storage                    │
│   (models/)        │        (storage/)                  │
│   - .md only       │      - any extension              │
│   - strips ext     │      - full filename              │
│   - loadCorpus()   │      - get()/write()              │
└─────────────────────┴───────────────────────────────────┘
```

### Target (Unified)

```
┌─────────────────────────────────────────────────────────┐
│                     brain.js                            │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │              format.js                          │   │
│   │   - parse/serialize                           │   │
│   │   - loadFile/saveFile                         │   │
│   │   - DEFAULT_EXTENSIONS                        │   │
│   └─────────────────────────────────────────────────┘   │
│                         │                                │
│   ┌─────────────────────┴───────────────────────────┐  │
│   │              Unified File Layer                  │  │
│   │   - All extensions supported                   │  │
│   │   - Extension-aware API                        │  │
│   └─────────────────────────────────────────────────┘  │
│                         │                                │
│   ┌─────────────────────┴───────────────────────────┐  │
│   │              Data Layer                          │  │
│   │   - Corpus (models/)                           │  │
│   │   - Storage (storage/)                         │  │
│   │   - Geometry (models/*/geometry/)             │  │
│   └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### 1. Extension Priority

When both `foo.md` and `foo.json` exist:

- **Decision**: Use priority order: `.md` > `.json` > `.yaml` > `.yml` > `.txt` > `.ini`
- **Rationale**: .md is current default, maintains backwards compatibility
- **Alternative considered**: Error on collision (rejected - too restrictive)

### 2. API Changes

**Current**:
```javascript
brain.loadCorpus()           // Returns { identity: { content, source } }
brain.get(category, key)     // Returns raw content
```

**New**:
```javascript
brain.loadCorpus()           
// Returns { 
//   identity: { content, source, format, parsed },
//   geometry: { content, source, format, parsed }
// }

brain.get(category, key, { parse: true })  // Returns parsed object
brain.get(category, key, { parse: false }) // Returns raw content
brain.get(category, key)                    // Returns both: { raw, parsed }
```

### 3. Backwards Compatibility

- `brain['foo']` returns same shape (content + source)
- Add `parsed` field with format.js result
- Add `format` field with detected type
- Storage continues to work (uses full filenames)

### 4. Storage Integration

- Storage layer can optionally use format.js for auto-serialization
- Config option: `storage.format = 'auto'` (default: off for backwards compat)
- When enabled: `write('notes', 'data', { json: {...} })` auto-serializes

---

## Implementation Phases

### Phase 1: Format.js Integration (Foundation)

- [ ] Update format.js if needed (ensure all methods work)
- [ ] Add extension detection helper to format.js
- [ ] Add format-aware file listing to format.js

### Phase 2: Brain Corpus Extension

- [ ] Import format.js DEFAULT_EXTENSIONS in brain.js
- [ ] Replace `.md` hardcoding with extension list
- [ ] Add `getBrainName(file)` helper that strips any extension
- [ ] Store `{ content, source, format, parsed }` instead of `{ content, source }`
- [ ] Exclude `/boot` directories from corpus loading

### Phase 3: Unified File Operations

- [ ] Add `brain.loadFile(path)` using format.loadFile
- [ ] Add `brain.saveFile(path, data)` using format.saveFile
- [ ] Deprecate old methods with warnings

### Phase 4: Storage Integration

- [ ] Add format option to storage.write()
- [ ] Add auto-serialize support in BrainStorage
- [ ] Add config: `brain.storageFormat = 'auto'`

### Phase 5: Transform/Horcrux Updates

- [ ] Use format.js DEFAULT_EXTENSIONS in transform.js
- [ ] Exclude /boot directories in gather functions
- [ ] Add brain filter options: `{ brains: { public: ['vant'], private: ['nova'] } }`

### Phase 6: Testing & Docs

- [ ] Test all file types load correctly
- [ ] Test backwards compatibility
- [ ] Update MCP documentation
- [ ] Update AGENTS.md

---

## File Changes Required

### lib/format.js
- Add `getExtensions()` helper
- Add `getFormatFromPath(path)` export
- Ensure loadFile/saveFile work for all types

### lib/brain.js
- Import format.js
- Replace 8+ places with `.md` hardcoding
- Add extension-aware helpers
- Update loadCorpus to return parsed data

### lib/transform.js
- Use format.js DEFAULT_EXTENSIONS
- Add brain filter options
- Exclude /boot directories

### lib/storage.js (optional)
- Add format serialization option
- Update BrainStorage to use format.js

---

## Open Questions

1. **Geometry loading**: Should geometry/ JSON files be in corpus or separate?
2. **Remote brains**: How does this work with remote brain storage?
3. **Caching**: Should parsed objects be cached separately?
4. **Migration**: How to migrate existing .md to .json if desired?

---

## Related Files

- lib/format.js - Format detection and parsing
- lib/brain.js - Brain corpus and storage
- lib/transform.js - Horcrux backup/restore
- lib/storage.js - Storage abstraction
- lib/mcp.js - MCP tools that use brain

---

## References

- format.js SUPPORTED_FORMATS: yaml, json, md, txt
- format.js DEFAULT_EXTENSIONS: ['.yaml', '.yml', '.json', '.md', '.txt', '.ini']
- Current brain load: ~2100 lines in brain.js
