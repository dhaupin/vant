---

version: 0.8.6
permalink: /advanced/rerank
layout: default
title: Rerank (RAG)

nav_order: 92
---


> RAG-powered memory reranking and compression for LLM context.

## Overview

Vant's rerank module provides **Retrieval-Augmented Generation** capabilities:
- **Rerank** memories by keyword relevance to query
- **Compress** content to fit token budgets
- **Pipeline** mode runs both in sequence

This is distinct from search (semantic BM25/Vector) - rerank does keyword matching on results.

## CLI Usage

```bash
# Rerank memories against query
vant rerank "lessons learned"
vant rerank "security fixes" -k 10

# Compress a file to token budget
vant rerank compress lessons.md -t 2000

# Refine: rerank + compress
vant rerank refine "security fixes" -k 10 -t 2000

# Stats
vant rerank -s
```

(There is no `vant rerank pipeline` CLI verb - the pipeline shape lives
in the lib as rerank-then-compress.)

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-k, --top-k` | Top K results | 5 |
| `-t, --max-tokens` | Max tokens for compression | 2000 |
| `-s, --stats` | Show rerank statistics | - |
| `-v, --verbose` | Verbose output | - |

## MCP Tools

The registered `vant_rerank` tool takes `{ query, docs }` and reranks
the docs array:

```javascript
await mcp.call('vant_rerank', {
    query: 'lessons learned',
    docs: ['doc one...', 'doc two...']
});
// { query, results } - reranked docs
```

(The `mode`/`topK`/`maxTokens` parameter surface was fiction - the
registered schema is exactly `query` + `docs`; compression is the
lib's `compress` function.)

## Programmatic Usage

Rerank lives in lib/search.js (there is no `vant.rerank` getter):

```javascript
const rerank = require('./lib/search');

// Get memories from brain
const memories = [
    { id: '1', title: 'Security', content: '...', date: '2026-01-01' },
    { id: '2', title: 'Lessons', content: '...', date: '2026-01-02' }
];

// Rerank against query
const results = rerank.rerank(memories, 'security fixes', 5);

// Compress to token budget
const compressed = rerank.compress(results, 2000);

// Refine: rerank + compress
const refined = rerank.refine(memories, 'security', { topK: 10, maxTokens: 4000 });
```

(The `pipeline` export name was fiction - the combined operation is
`refine`.)

## How It Works

### Rerank

1. Extract query terms (words > 2 chars)
2. Score each memory by:
   - Title match (+10)
   - Query term in content (+1 each)
   - Query term in title (+2 each)
   - Recency boost (+0.5)
3. Return top-K sorted by score

### Compress

1. Strip markdown fluff (headers, bold, empty lines)
2. Truncate to token budget
3. Mark truncated entries

### Pipeline

Runs rerank -> compress in sequence, returns stats.

## Integration

Rerank is separate from search. Use it to:
- Re-rank search results after retrieval
- Prepare memories for LLM context
- Optimize token usage

Search already hooks into rerank: `vant search <query> -r` reranks and
compresses results (live since pass 134's search verification).

## Related

- [Search](/vant/memory/search)
- [Hybrid Search](/vant/advanced/search-architecture)
- [Entropy](/vant/reference/entropy)
- [CLI Reference](/vant/reference/cli)