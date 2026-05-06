---
version: 0.8.6
permalink: /deprecations
layout: default
title: Deprecations
nav_order: 99
---

> Track deprecated, orphaned, and planned-for-removal files.

## v0.8.7

### Search Refactor

| File | Status | Notes |
|------|--------|-------|
| `lib/rerank.js` | 🔸 Consider | Re-rank + compress. Only used in tests. Could integrate into search.js |
| `lib/hybrid.js` | 🔸 Consider | Public/private brain sync (different feature). Not imported anywhere |

### Recommendation

- Keep `lib/hybrid.js` - different feature (privacy sync), just needs docs
- Deprecate `lib/rerank.js` - function moved to search.js or no longer needed
- Move functionality to main search.js if still needed

## v0.9.0

| File | Status | Notes |
|------|--------|-------|
| `bin/hybrid-sync.js` | 🔸 Review | Standalone CLI for hybrid sync feature |
| `bin/test-all.js` | 🔸 Review | Old test runner, consolidated into test/*.js |

## Resolved

| File | Resolution | Version |
|------|------------|---------|
| `lib/search-hybrid.js` | Kept + lazy-load | v0.8.6 |
| Session cache | Added to search.js | v0.8.6 |

## Related

- [Search Architecture](guides/search-architecture)
- [CLI Reference](guides/cli)