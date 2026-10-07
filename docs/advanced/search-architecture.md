---

version: 0.8.6
permalink: /advanced/search-architecture
layout: default
title: Search Architecture

nav_order: 91
---


> **v0.8.6+**: How search connects your memory islands.

## The Problem

Your brain lives in `models/private/` - thousands of files with learnings, decisions, context. When you search, it has to scan all of them. That's slow.

**Without optimization:**
```text
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
| **LTC index** | Pre-built Long-Term-Core index over the corpus | Fast first hop |
| **Compact** | Skip re-hydration, return summaries | Fast |
| **Lazy Load** | Defer heavy module loading | Fast boot |

### Layer 1: The LTC Index

Search hits the LTC (Long Term Core) index instead of scanning raw
files. Rebuild or refresh it with `freshLTC()`; read it with `getLTC()`
(both real exports of lib/search.js).

### Layer 2: Compact Mode

Don't need full file content? Just summaries.

**Compact returns summaries only. Skip re-hydration for speed.**

```javascript
// Full search + rehydrate (rehydrateMaxSize: 5000 bytes default)
const { results, context } = await search.query('python');

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

**Lazy load delays heavy module loading until first use. Fast boot.**

```javascript
// Before: loaded at startup
const search = require('vant').search;  // ~2s load

// After: loaded on first use (~50ms boot)
```

The search-hybrid module loads only when you call `search.hybrid()` or `search.query()`.

## Islands Architecture

**Concept**: Your memories are **islands of context**. Search connects them.

```text
Query → Find islands → Re-hydrate context
    ↓        ↓              ↓
  Bridge  Discovery    Full content
```

Each brain file (`models/private/*.md`) is an island:
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

**Search module exposes all methods.**

```javascript
const search = require('vant').search;

// Index access
search.getLTC();        // current LTC index
await search.freshLTC(); // rebuild it

// Search modes
search.query('python');                       // RAG: search + rehydrate
search.query('python', { compact: true });    // Summaries only
search.hybrid('python');                      // BM25 (+ RRF-fused results)
search.semantic('python', { limit: 10 });     // embedding-powered
search.getSettings();  // { compressionThreshold: 2000, rehydrateMaxSize: 5000, ragLimitMax: 10, ragTokenLimit: 3000 }
```

(The `getCacheStats`/`clearCache`/`searchLTC` surface was fiction -
there is no query-result cache in lib/search.js and the text hop is
`getLTC`.)

```bash
# CLI
vant search python -l 3
vant search python --mode rag --compact
```

**MCP tool available as `vant_search`** - call it with
`{ "query": "python" }` (schema: `query` + `limit`; compact is a CLI
option, not part of the registered tool schema).

## Security

Unchanged limits (lib/search.js getSettings + VAF check):
- Query: 500 chars max (VAF-validated)
- Re-hydrate: 5000 bytes max (`rehydrateMaxSize`)
- Compression threshold: 2000 (`compressionThreshold`)
- RAG limits: 10 results, 3000 tokens

## Related

- [Hybrid Search](/vant/integrations/hybrid) - BM25 + Vector + RRF
- [Brain](/vant/memory/brain) - Memory islands
- [CLI](/vant/reference/cli) - Search command
- [MCP](/vant/runtime/mcp) - Search tool