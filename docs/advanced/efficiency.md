---
version: 0.8.6
permalink: /advanced/efficiency
layout: default
title: Efficiency
nav_order: 100
description: The real efficiency levers - rate budgets, caching, batch embedding, compression, and what startup does and does not do.
---

# Efficiency

Vant's state IS your files, so most efficiency work is about not doing needless work: budgeting calls, caching, batching, and compressing what lives in the brain. Every lever below is verified against the code.

## Rate budgets

- `vant rate` shows your GitHub API rate limit (it is what sync draws on)
- The server layer rate limits per client: 60 requests/minute by default, tunable via `lib/qos.js` (`maxPerMinute`) - see [QoS](/vant/operations/qos)
- The MCP door has its own budget path: config `qos.maxPerMinute` (see [Configuration](/vant/reference/config))

## Cache, don't refetch

`lib/cache.js` is the process-local cache with TTL semantics, and `lib/tmp.js` fronts it for scratch values:

```javascript
tmp.cacheSet('session', data, 3600000);  // 1 hour TTL
const val = tmp.cacheGet('session');     // null when expired
```

There is no automatic HTTP conditional-get layer in the connectors today: if a GitHub call is hot in your loop, cache its result yourself with the helper above rather than waiting on the rate budget.

## Batch the embedding work

`lib/embed.js` batches vectorization instead of one call per item, and stack-wide reindexing is a single call:

```javascript
const embed = require('vant/lib/embed');

await embed.generateBatch([textA, textB, textC]);  // one batch, embed:batch events
await embed.generateBatchStack(texts);            // batch across the whole brain stack
```

## Compress what you keep

- `vant compress <file_or_folder>` emits entropy-patched `.vpatch` files (see [Entropy Patching](/vant/reference/entropy))
- `vant rerank compress <file>` squeezes a results file down before it feeds an LLM context (see [Rerank](/vant/advanced/rerank))
- `vant prune` drops old or stale brain files entirely (see [Pruning](/vant/memory/prune))

## Trim the context, not the data

- [Succession](/vant/multi-agent/succession) is the designed mechanism for handing only what the next run needs forward
- [Memory Store](/vant/memory/memory-store) keeps facts short-lived unless they are written into brain files

## Startup: what actually happens

`vant start` runs migrate, then health, then ready - and by design it does NOT sync automatically (pass 121 ruling):

- `--no-migrate` skips the layout migration check
- `--sync` opts INTO pulling/pushing (otherwise use `vant sync` when you want it)

So the cheapest startup is already the default: `vant start` and skip both migration and sync explicitly only when you know why.

---

## Related

- [QoS](/vant/operations/qos) - the per-client rate limiter and breaker
- [Entropy Patching](/vant/reference/entropy) - compression for brain files
- [Rerank](/vant/advanced/rerank) - context-result compression
- [Pruning](/vant/memory/prune) - retention and aging out
- [CLI](/vant/reference/cli) - the commands referenced above
