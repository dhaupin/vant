---
version: 0.8.6
permalink: /rerank.md/rerank
layout: default
title: Rerank (RAG)
nav_order: 98
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

# Compress to token budget
vant rerank compress -t 2000

# Pipeline: rerank + compress
vant rerank pipeline "memory" -t 4000

# Stats
vant rerank -s
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-k, --top-k` | Top K results | 5 |
| `-t, --max-tokens` | Max tokens for compression | 2000 |
| `-s, --stats` | Show rerank statistics | - |
| `-v, --verbose` | Verbose output | - |

## MCP Tools

```javascript
// Rerank mode
await mcp.call('vant_rerank', {
    query: 'lessons learned',
    mode: 'rerank',
    topK: 5
});

// Compress mode  
await mcp.call('vant_rerank', {
    mode: 'compress',
    maxTokens: 2000
});

// Pipeline mode
await mcp.call('vant_rerank', {
    query: 'security',
    mode: 'pipeline',
    topK: 10,
    maxTokens: 4000
});
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Query to rerank against |
| `mode` | string | One of: rerank, compress, pipeline |
| `topK` | number | Top K results to return |
| `maxTokens` | number | Max tokens for compression |

## Programmatic Usage

```javascript
const rerank = require('vant').rerank;

// Get memories from brain
const memories = [
    { id: '1', title: 'Security', content: '...', date: '2026-01-01' },
    { id: '2', title: 'Lessons', content: '...', date: '2026-01-02' }
];

// Rerank against query
const results = rerank.rerank(memories, 'security fixes', 5);

// Compress to token budget
const compressed = rerank.compress(results, 2000);

// Full pipeline
const pipeline = rerank.pipeline(memories, 'security', { 
    topK: 10, 
    maxTokens: 4000 
});
```

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

Runs rerank → compress in sequence, returns stats.

## Integration

Rerank is separate from search. Use it to:
- Re-rank search results after retrieval
- Prepare memories for LLM context
- Optimize token usage

Search can hook into rerank via `--rerank` flag (future).

## Related

- [Search](guides/search)
- [Hybrid Search](advanced/search.md)
- [Entropy]/reference/entropy
- [CLI Reference](reference/cli)