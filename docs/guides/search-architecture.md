---
title: Search Architecture
nav_order: 15
---

> **v0.8.6+**: How search connects your memory islands.

## The Problem

Your brain lives in `models/public/` - thousands of files with learnings, decisions, context. When you search, it has to scan all of them. That's slow.

**Without optimization:**
```
Query "python"
→ Scan 1000s files
→ Parse each for relevance
→ Re-hydrate full content
→ Return results
= SLOW (seconds)
```

## Solution: 3-Layer Speed

| Layer | What | Speed |
|-------|------|-------|
| **Cache** | Store results per-session | Instant |
| **Compact** | Skip re-hydration, return summaries | ~100ms |
| **Lazy Load** | Defer heavy module loading | Fast boot |

### Layer 1: Session Cache

Same search runs repeatedly? Cache it.

```javascript
// First call - slow
const r1 = await search.hybrid('python');

// Second call - instant (cached)
const r2 = await search.hybrid('python');
```

- **Key**: MD5 hash of query (handles special chars)
- **Max**: 50 entries per session
- **Eviction**: LRU (least recently used)

### Layer 2: Compact Mode

Don't need full file content? Just summaries.

```javascript
// Full search + rehydrate
const { results, context } = await search.query('python');
// context: Full file contents (~50KB max)

// Compact - summaries only
const { results, context } = await search.query('python', { compact: true });
// context: "- Learned X\n- Decided Y..."
```

**When to use:**
- Quick RAG checks
- Building context for another agent
- Debugging search results

### Layer 3: Lazy Load

Heavy modules slow boot? Load on-demand.

```javascript
// Before: loaded at startup
const search = require('./lib/search');  // ~2s load

// After: loaded on first use (~50ms boot)
```

The hybrid-search module loads only when you call `search.hybrid()` or `search.query()`.

## Islands Architecture

**Concept**: Your memories are **islands of context**. Search connects them.

```
Query → Find islands → Re-hydrate context
    ↓        ↓              ↓
  Bridge  Discovery    Full content
```

Each brain file (`models/public/*.md`) is an island:
- Contains specific learnings
- Connected to other islands via topics
- Discoverable via search

**Why it scales:**

| Memories | Traditional | Islands |
|----------|-------------|---------|
| 100 | ~1s | ~100ms |
| 1000 | ~10s | ~200ms |
| 10000 | timeout | ~500ms |

The LTC (Long Term Core) index is the "map". Git history is the "archive". Search uses the map to find islands, then re-hydrates from the archive.

## API

```javascript
const search = require('./lib/search');

// Cache management
search.getCacheStats();    // { size: N, max: 50 }
search.clearCache();     // Clear session cache

// Search modes
search.searchLTC('python');     // Text search (fast)
search.query('python');        // RAG: search + rehydrate
search.hybrid('python');      // BM25 + Vector + RRF
search.query('python', { compact: true });  // Summaries only

// CLI
vant search python -l 3
vant search python --mode rag --compact

// MCP
{ "name": "vant_search", "arguments": { "query": "python", "compact": true } }
```

## Security

Unchanged limits:
- Query: 500 chars max
- Re-hydrate: 50KB max
- Compression threshold: 5KB
- Only reads from `models/vX/` directory

## Related

- [Hybrid Search](hybrid) - BM25 + Vector + RRF
- [Brain](brain) - Memory islands
- [CLI](cli) - Search command
- [MCP](mcp) - Search tool