---
version: 0.8.6
permalink: /memory/rag
layout: default
title: RAG with Vant
description: The retrieval lane - index, embed, and rerank brain files for RAG answers.
nav_order: 28
---

# Tutorial: Build RAG with Your Brain

> 15-minute tutorial to build retrieval-augmented generation using your Vant brain

## What You'll Build

An AI that retrieves relevant context from your brain before answering.

## Why RAG?

Without RAG:
- AI has no context from previous sessions
- AI forgets everything when conversation ends

With RAG:
- Query your brain for relevant context
- Include context in AI prompt
- Get accurate, context-aware responses

## Architecture

```text
User Query
    │
    ▼
┌─────────────┐
│   Vant      │
│  Search    │──▶ Query brain (BM25 + Vector)
└─────────────┘
    │
    ▼
Context + User Query
    │
    ▼
┌─────────────┐
│    AI       │──▶ Generate response
└─────────────┘
```

## Step 1: Query Brain

```javascript
const search = require('vant').search;

async function queryBrain(question) {
    // Search brain; returns { memories, results, context }
    const result = await search.query(question, {
        limit: 5
    });

    // context is the joined snippet string, ready for a prompt
    return result.context;
}

const context = await queryBrain('authentication');
console.log(context);
```

## Step 2: Build Prompt

```javascript
function buildPrompt(question, context) {
    return `
You are a helpful assistant with access to long-term memory.

Context from your brain:
${context}

User question: ${question}

Answer based on the context above. If the context doesn't contain
relevant information, say so.
`;
}
```

## Step 3: Call AI

```javascript
async function askWithRAG(question) {
    // 1. Get context
    const context = await queryBrain(question);
    
    // 2. Build prompt
    const prompt = buildPrompt(question, context);
    
    // 3. Call AI (example with OpenAI)
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
    });
    
    return response.choices[0].message.content;
}
```

## Step 4: Put It Together

```javascript
const vant = require('vant');
const search = require('vant').search;

async function ragAgent(question) {
    // Initialize
    await vant.init({ name: 'RAGAgent' });

    // Think: runs the same retrieval internally and returns insights
    const result = await vant.think(question);

    return {
        question,
        insights: result.insights,
        memories: result.memories
    };
}
```

## Hybrid Search

Use BM25 + Vector for better results:

```javascript
const result = await search.hybrid('question', { limit: 5 });
// result.fused is the BM25-ranked result list
```

See [Brain Search](/vant/memory/search) for details.

## Semantic Search + the Vector Map (P4)

`vant_search_semantic` (door + `search.semantic`) scores the corpus by real
cosine similarity against the query embedding. Two honesty seams it ships
with:

- **Per-doc embed cap (20000 chars)**: an oversized brain file fed verbatim
  through the input pipeline permanently blocked the whole surface (the
  scorer is the data feeder; it caps at the seam instead of pushing
  unbounded corpus text through generate). User QUERY input keeps every
  scan - owner-owned doc content rides the internal `blobContent` length
  gate only (vaf.js; the MCP schemas expose no such field to callers).
- **withProjection (opt-in)**: returns a deterministic seeded JL projection
  of the SAME vectors the scoring used - `projection.points` where point 0
  is the query anchor and `points[i + 1]` pairs BY INDEX with
  `results[i]` (dims 2, seed 9). The dashboard's Brains map consumes this
  contract fail-closed; a hostile projection is not a plot.

Pinned live (door included): `test/embed-projection.test.js`.

## Cache Results

Cache common queries (TTL is an options object):

```javascript
const { Cache } = require('./lib/cache');
const cache = new Cache({ defaultTTL: 60000 });

async function cachedQuery(question) {
    const cached = cache.get('rag:' + question);
    if (cached) return cached;

    const result = await ragAgent(question);
    cache.set('rag:' + question, result, { ttl: 60000 });
    return result;
}
```

---

## Use Cases

### Support Bot

```text
User: How do I reset password?
→ Query brain for password reset docs
→ Return step-by-step guide
```

### Code Assistant

```text
User: How do I connect to PostgreSQL?
→ Query brain for database learnings
→ Return relevant code snippets
```

### Research Assistant

```text
User: What do I know about量子计算?
→ Query brain for quantum computing
→ Return all relevant notes
```

---

## Related

- [Brain Search](/vant/memory/search)
- [Runtime](/vant/runtime/runtime)
- [MCP](/vant/runtime/mcp)