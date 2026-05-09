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

### Batch 1 - Class Refactor (f1fd28e)

| File | Resolution | Notes |
|------|------------|---------|
| `lib/brain-class.js` | ✅ Resolved | Merged into lib/brain.js |
| `lib/search-class.js` | ✅ Resolved | Merged into lib/search.js |
| `lib/sync-class.js` | ✅ Resolved | Merged into lib/sync.js |
| `lib/resolution-class.js` | ✅ Resolved | Merged into lib/resolution.js |
| `lib/metrics-class.js` | ✅ Resolved | Merged into lib/metrics.js |
| `lib/circuit-breaker.js` | ✅ Resolved | Two implementations - sync has file-based, qos has class |
| `lib/bulkhead.js` | ✅ Resolved | Merged into lib/qos.js (Bulkhead class) |
| `lib/rate-limit-class.js` | ✅ Resolved | Rate limiter now in lib/qos.js |
| `lib/rate-limit.js` | ✅ Resolved | Rate limiter now in lib/qos.js |
| `lib/rate-limiter.js` | ✅ Resolved | Rate limiter now in lib/qos.js |

### Batch 2 - HTTP Server (9f63c37)

| File | Resolution | Notes |
|------|------------|---------|
| `lib/request.js` | ✅ Resolved | Merged into lib/server.js |
| `lib/response.js` | ✅ Resolved | Merged into lib/server.js |
| `lib/router.js` | ✅ Resolved | Merged into lib/server.js |
| `lib/static.js` | ✅ Resolved | Merged into lib/server.js |

### v0.8.6 Notes

- Search system refactored: rerank.js kept but may integrate later
- Hybrid.js kept as separate feature (different from search-hybrid)
- Test CLI renamed for clarity
- Rate limiting consolidated into QoS class
- All -class.js files merged into base implementations

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