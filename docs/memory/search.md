---
version: 0.8.6
permalink: /memory/search
layout: default
title: Brain Search
nav_order: 23
description: Semantic retrieval over the brain corpus - embeddings, hybrid search, rerank, and citations for grounded answers.
---

# Brain Search

> Ask the corpus a question, get the brain files that answer it.

Brain search is semantic retrieval over everything the brain holds. It is
how an agent finds the lesson from three weeks ago without remembering
which file it lives in.

## CLI

Search the corpus:

```bash
vant search "why did the WAL replay fail"
```

The query runs through the embed provider, scores the corpus, and returns
ranked brain files. This is the command an agent calls when context is
missing and the answer probably exists in memory already.

## Code

The search module exposes the query surface directly:

```javascript
const search = require('./lib/search');
const results = await search.queryBrain('migration failure recovery');
```

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

## Rerank

Retrieval quality improves when a second pass reorders the first pass
results against the query:

```bash
vant rerank "query" 
```

The rerank module (`Rerank`, `Hybrid`, `Hyde` in `lib/search.js`) implements
relevance second-stage scoring. Use it when the corpus is large enough that
top-5 by embedding alone starts missing.

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

The architecture, LTC freshness, and the settlement model behind the search
index are documented in [Search Architecture](/vant/advanced/search-architecture).
