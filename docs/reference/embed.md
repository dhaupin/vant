---
version: 0.8.6
permalink: /reference/embed
layout: default
title: Embed API
nav_order: 124
---

# Embed API

Vector embeddings for brain search and similarity.

> Requires AI provider (OpenAI, Anthropic, etc.)

## Functions

| Function | What |
|----------|------|
| `generate(text, options)` | Generate embedding vector |
| `generateBatch(texts[], options)` | Batch generate |
| `generateStack(text)` / `generateBatchStack(texts)` | Multibrain stack forms |
| `cosineSimilarity(a, b)` | Similarity score |
| `setProvider(name)` | Set active provider |
| `listProviders()` | List available |
| `getProviderInfo()` | Active provider info |

## Usage

```javascript
const embed = require('vant/lib/embed');

// Single embedding
const vec = await embed.generate('natural language query');

// Similarity (sync)
const sim = embed.cosineSimilarity(vec1, vec2);
// → 0.0-1.0 score

// Batch
const vecs = await embed.generateBatch(['query1', 'query2']);
```

Providers (`hash`, `local`, `openai`) are managed with `setProvider` /
`listProviders` - the CLI surface is `vant embed set/list/info/generate`
(see the CLI Reference).

## Events

| Event | When |
|-------|------|
| `embed:generating` | Before generation |
| `embed:generated` | After completion |
| `embed:batch:starting` | Before batch |
| `embed:batch:complete` | After batch |