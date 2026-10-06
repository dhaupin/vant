---
version: 0.8.6
permalink: /advanced/
layout: default
title: Advanced
nav_order: 90
description: Deep dives - search architecture, rerank, NSC9 geometry, RPC, style, and troubleshooting.
---

# Advanced

> Deep dives for extending Vant, tuning retrieval, and debugging hard.

| Page | Job |
|------|-----|
| [Search Architecture](/vant/advanced/search-architecture) | How hybrid search and indexing work |
| [Rerank](/vant/advanced/rerank) | The rerank pipeline and model |
| [NSC9 Spec](/vant/advanced/nsc9-spec) | Quasicrystal addressing format |
| [RPC](/vant/advanced/rpc) | RPC layer details |
| [Schema](/vant/reference/schema) | Brain schema validation |
| [Troubleshooting](/vant/advanced/troubleshooting) | Field guide to common failures |
| [Audit](/vant/advanced/audit) | The audit report generator |
| [Efficiency](/vant/advanced/efficiency) | Token and storage efficiency |
| [Release](/vant/advanced/release) | Release process |
| [Agent Contributors](/vant/advanced/agent-contributors) | How agents author Vant: the loop, the pins, the record |

## Where to start

Retrieval returning noise: [Brain Search](/vant/memory/search) and
[Rerank](/vant/advanced/rerank). Building against internals:
[Architecture](/vant/essential/architecture) first. A crash you cannot
explain: [Troubleshooting](/vant/advanced/troubleshooting).

## One example

```bash
vant search "quasicrystal addressing" --mode rag -r
```
