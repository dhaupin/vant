---
version: 0.8.6
permalink: /memory/search
layout: default
title: Brain Search
nav_order: 23
description: Semantic retrieval over the brain corpus - modes, hybrid search, rerank, citations, and MCP tools.
---

# Brain Search

> Ask the corpus a question, get the brain files that answer it.

Brain search is semantic retrieval over everything the brain holds. It is
how an agent finds the lesson from three weeks ago without remembering
which file it lives in. All modes - basic, hybrid, HyDE, and RAG - run
through one module, `lib/search.js`.

## CLI

Search the corpus:

```bash
vant search "why did the WAL replay fail"
```

The default mode is hybrid (BM25 + vector, fused). All modes:

```bash
vant search "query"                # hybrid (default)
vant search "query" --mode basic   # text search over current brain files
vant search "query" --mode rag     # semantic search over the LTC index
vant search --hybrid "query"       # explicit hybrid
vant search --hyde "query"         # HyDE query transform
vant search --stats                # index stats
```

Every mode supports rerank plus a token budget:

```bash
vant search "lessons" -r           # search, then rerank
vant search "lessons" -r -t 4000   # rerank, compressed to 4000 tokens
```

`-t, --max-tokens` defaults to 2000. This is the command an agent calls
when context is missing and the answer probably exists in memory already.

## Code

The search module exposes the query surface directly:

```javascript
const search = require('./lib/search');
const results = await search.queryBrain('migration failure recovery');
```

Or through the runtime object (`vant.search`):

```javascript
const vant = require('./lib/vant');
const search = vant.search;

// RAG: semantic search + rehydration from git history
const { results, context } = await search.query('authentication');

// Hybrid: BM25 + vector fusion
const fused = await vant.search.hybrid('authentication');

// HyDE: transform the query into a hypothetical answer, search with it
const hyde = await vant.search.hyde('herbalism plants');
```

LTC helpers: `search.getLTC()` (cached) and `search.freshLTC()` (bypasses
the cache); `search.getSummary()` reports whether LTC exists and what it
holds. Query length is capped at 500 characters.

Embeddings power the scoring. The provider is pluggable:

| Provider | Needs | Notes |
|----------|-------|-------|
| `hash` | nothing | word hashing, always works, zero deps |
| `local` | `@xenova/transformers` | local model, no network |
| `openai` | `OPENAI_API_KEY` | hosted embeddings |

Check what is active:

```bash
vant embed info
```

Generate an embedding for a single text:

```bash
vant embed generate "the sentence to embed"
```

## MCP tools

Search is exposed to agents as separate MCP tools - one per mode, no
mode parameter:

| Tool | Args | What it does |
|------|------|--------------|
| `vant_search` | `query`, `limit` | text search via `queryBrain` |
| `vant_search_semantic` | `query`, `limit` | embedding search |
| `vant_search_hybrid` | `query`, `topK` | BM25 + vector fusion |
| `vant_search_hyde` | `query`, `topK` | HyDE transform |

```javascript
await vant_search({ query: 'lessons', limit: 10 });
await vant_search_hybrid({ query: 'lessons', topK: 5 });
```

The full list lives in [MCP Tools Reference](/vant/reference/mcp-tools).

## RAG mode and rehydration

RAG mode searches the LTC index - the distilled core pruning generates at
`<version>/_core.json` - then rehydrates full matching content from git
history. The settings come from `settings.ini` (see
`settings.example.ini`):

| Setting | Example default | Purpose |
|---------|-----------------|---------|
| `REHYDRATE_MAX_SIZE` | 51200 (50KB, max 1MB) | max bytes returned in RAG context |
| `COMPRESSION_THRESHOLD` | 5120 (5KB) | when to apply the compression hint |
| `RAG_LIMIT_MAX` | 20 | max results from an LTC query |

The module's code defaults live in `search.getSettings()` and can differ
from the example file - call it if you need the exact values a given
install enforces:

```javascript
search.getSettings();
// { compressionThreshold, rehydrateMaxSize, ragLimitMax, ragTokenLimit }
```

## Search vs Rerank

| Feature | Search | Rerank |
|---------|--------|--------|
| Type | Semantic + keyword fusion | Keyword scoring |
| Use case | Find relevant memories | Prepare results for an LLM |
| Input | Query | Query + candidate memories |
| Output | Ranked candidates | Ranked + compressed text |

Use search to find candidates, rerank to optimize for LLM context. The
full pipeline is in [Rerank](/vant/advanced/rerank).

## Rerank

Retrieval quality improves when a second pass reorders the first pass
results against the query:

```bash
vant rerank "query"
```

The rerank module (`Rerank`, `Hybrid`, `Hyde` in `lib/search.js`)
implements relevance second-stage scoring. Use it when the corpus is
large enough that top-5 by embedding alone starts missing.

## Citations

Answers grounded in brain files can carry git-backed receipts. The
citations module records sources and renders them as a commit footer:

```javascript
const citations = require('./lib/citations');
citations.addSource('lessons.md#sync-race');
citations.getCommitFooter();
```

Details and the verification flow are in [Citations](/vant/memory/citations).

## Internals

The architecture, LTC freshness, and the settlement model behind the
search index are documented in [Search Architecture](/vant/advanced/search-architecture).
A worked RAG example is in [RAG with Vant](/vant/memory/rag).

## Related

- [Rerank](/vant/advanced/rerank) - the rerank pipeline and model
- [RAG with Vant](/vant/memory/rag) - worked retrieval example
- [Citations](/vant/memory/citations) - git-backed grounding
- [MCP Tools Reference](/vant/reference/mcp-tools) - the agent-facing surface
- [Pruning](/vant/memory/prune) - generates the LTC index search reads
