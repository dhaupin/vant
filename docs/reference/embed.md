---
version: 0.8.7
permalink: /reference/embed
layout: default
title: Embed API
nav_order: 81
---

# Embed API

Vector embeddings for brain search and similarity.

> Requires AI provider (OpenAI, Anthropic, etc.)

## Functions

| Function | What |
|----------|------|
| `embed(text)` | Generate embedding vector |
| `embedBatch(texts[])` | Batch generate |
| `cosineSimilarity(a, b)` | Similarity score |
| `register(provider, fn)` | Register embedder |
| `setEmbedder(name)` | Set active embedder |
| `listEmbedders()` | List available |

## Usage

```javascript
const embed = require('vant/lib/embed');

// Single embedding
const vec = await embed.embed('natural language query');
// → Float32Array of 1536 dims (OpenAI)

// Similarity
const sim = await embed.cosineSimilarity(vec1, vec2);
// → 0.0-1.0 score

// Batch
const vecs = await embed.embedBatch(['query1', 'query2']);
```

## Events

| Event | When |
|-------|------|
| `embed:generating` | Before generation |
| `embed:generated` | After completion |
| `embed:batch:starting` | Before batch |
| `embed:batch:complete` | After batch |