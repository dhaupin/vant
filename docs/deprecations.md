---
version: 0.8.6
permalink: /deprecations
layout: default
title: Deprecations
nav_order: 99
---

> Track deprecated, orphaned, and planned-for-removal files.

## Resolved in v0.8.6

| File | Resolution | Notes |
|------|------------|---------|
| `lib/rerank.js` | ✅ Resolved | Integrated into Search.Rerank inner class |
| `lib/hybrid.js` | Keep + docs | Different feature (privacy sync), just needs docs |
| `lib/search-hybrid.js` | Kept + lazy-load | Session cache added |
| `bin/test-v086.js` | Renamed → test-core.js | CLI: `vant test v086` → `vant test core` |
| Session cache | Added to search.js | Implemented |
| `lib/lru.js` | ✅ Resolved | Deleted - already in lib/cache.js |
| Search inner classes | ✅ Resolved | Search.Hybrid, Search.Hyde, Search.Rerank added to search.js |

### v0.8.6 Notes

- Search system refactored: rerank.js kept but may integrate later
- Hybrid.js kept as separate feature (different from search-hybrid)
- Test CLI renamed for clarity

## Planned for v0.8.7

| File | Status | Notes |
|------|--------|-------|
| (none yet) | - | - |

## Future (v0.9.0+)

| File | Status | Notes |
|------|--------|-------|
| `bin/hybrid-sync.js` | 🔸 Review | Standalone CLI - consolidate? |
| `bin/test-all.js` | 🔸 Review | Old test runner - consolidate into test/*.js? |

### Status Legend

- 🔸 Consider = may remove in future
- ❌ Deprecated = removed
- ✅ Resolved = handled

## Related

- [Search Architecture](guides/search-architecture)
- [CLI Reference](guides/cli)