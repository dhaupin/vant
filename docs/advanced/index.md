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
| [Search Tuning](/vant/advanced/search) | Modes, limits, and retrieval quality |
| [Architecture](/vant/advanced/architecture) | Module map and source of truth |
| [NSC9 Spec](/vant/advanced/nsc9-spec) | Quasicrystal addressing format |
| [RPC](/vant/advanced/rpc) | RPC layer details |
| [Schema](/vant/advanced/schema) | Schema handling internals |
| [Style](/vant/advanced/style) | Docs and code style rules |
| [Troubleshooting](/vant/advanced/troubleshooting) | Field guide to common failures |
| [Audit](/vant/advanced/audit) | The audit report generator |
| [Citations](/vant/advanced/citations) | Citation system internals |
| [Efficiency](/vant/advanced/efficiency) | Token and storage efficiency |
| [Framework](/vant/advanced/framework) | Agent framework integration |
| [Frontend](/vant/advanced/frontend) | Frontend-facing surfaces |
| [Pruning](/vant/advanced/pruning) | Prune strategies and LTC |
| [Release](/vant/advanced/release) | Release process |

## Where to start

Retrieval returning noise: [Search Tuning](/vant/advanced/search), then
[Rerank](/vant/advanced/rerank). Building against internals:
[Architecture](/vant/advanced/architecture) first. A crash you cannot
explain: [Troubleshooting](/vant/advanced/troubleshooting).

## One example

```bash
vant search "quasicrystal addressing" --mode rag -r
```
