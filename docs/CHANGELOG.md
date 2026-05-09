---
version: 0.8.6
permalink: /changelog
layout: default
title: Changelog
nav_order: 1
---

> Vant release history.

## Unreleased

### New: Network Layer

- Added `lib/network.js` (274 lines) - Network connectivity, retries, timeouts, latency
- Features: isOnline, checkOnline, getLatency, retry, withTimeout, fetch, fetchJson
- Integrated into: framework, vant, server, api, mcp, node, telegram
- Consolidated from: lib/utils.js (deleted)

### Refactor

- Deleted unused lib/utils.js (~180 lines, fully consolidated)

## v0.8.6 - 2026-05-08

### Agent OS

**Runtime and Framework**

| Module | LOC | What It Does |
|--------|-----|-------------|
| `lib/runtime.js` | 369 | think, learn, act, remember, getTools |
| `lib/framework.js` | 116 | init, think, act, query brain |
| `lib/agents.js` | 173 | spawn, fork, delegate, join, emit |
| `lib/ipc.js` | 55 | Inter-agent messaging |

**Core Refactor (AI-first)**

| Module | Before | After | Δ |
|--------|--------|-------|---|
| `lib/brain.js` | 636 | 281 | -355 |
| `lib/islands.js` | 103 | 211 | +108 |
| `lib/search.js` | 285 | 240 | -45 |
| `lib/framework.js` | 1165 | 116 | -1049 |

**Legacy Stubs (backward compat)**

All deprecated modules now re-export from consolidated:

- `lib/env.js` → config
- `lib/entropy.js` → compression
- `lib/buffer.js` → pool
- `lib/storage.js` → pool
- `lib/audit-log.js` → audit
- `lib/metrics.js` → audit
- `lib/serializer.js` → compression
- `lib/horcrux.js` → stego
- `lib/rerank.js` → search (inline)
- `lib/search-hybrid.js` → search (inline)
- `lib/search-hyde.js` → search (inline)

### Features

1. **Agent Runtime**
   - `runtime.init({name, role})` - Initialize agent
   - `runtime.think(query)` - Query brain for context
   - `runtime.learn(key, content)` - Store to brain
   - `runtime.remember(key)` - Persist across sessions
   - `runtime.act(fn)` - Execute with locks

2. **Multi-Agent**
   - `agents.spawn({name, role})` - Create sub-agent
   - `agents.fork()` - Clone for parallel work
   - `agents.join(conversation)` - Shared context
   - `agents.emit(event, data)` - Signal other agents

3. **IPC**
   - `ipc.send(channel, message)` - Send to channel
   - `ipc.subscribe(channel, handler)` - Subscribe

### v0.8.5 - 2026-05-07

**Search Consolidation**

- `lib/search.js` - Query brain, rerank, hydrate merged
- `lib/rerank.js` - DEPRECATED → merged into search
- `lib/search-hybrid.js` - DEPRECATED → merged into search
- `lib/search-hyde.js` - DEPRECATED → merged into search

### v0.8.4 - 2026-05-06

**Brain + Islands**

- `lib/islands.js` - Lazy-loadable skill blocks
- Islands trigger on prompt keywords

### Earlier

See Git history for releases before v0.8.4.
