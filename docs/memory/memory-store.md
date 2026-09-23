---
version: 0.8.6
permalink: /memory/memory-store
layout: default
title: Memory Store
nav_order: 22
description: Key-value state and document memory with TTL, sandbox gating, and geometric addressing.
---

# Memory Store

> Key-value state and documents, written during the session, read later by
> anything with access.

The brain files are for the things every session must know. The memory store
is for everything else: intermediate state, cached facts, documents worth
keeping, values with a shelf life.

## CLI

All store operations run through the memory command:

```bash
vant memory state <key> <value>
```

Sets a key-value pair. Pairs live in a TTL cache, so this is the right home
for session-scoped facts:

```bash
vant memory recall <key>
```

Reads a key back. Learning a document instead of a scalar:

```bash
vant memory learn <key> <content>
```

Documents persist and are queryable:

```bash
vant memory query <key>
```

List what exists:

```bash
vant memory list
```

Clear it:

```bash
vant memory clear
```

## Code

The same surface in code:

```javascript
const { memory } = require('./lib/memory');
await memory.learn('deploy-notes', 'R2 needs path-style addressing.');
const doc = await memory.query('deploy-notes');
```

Key-value state:

```javascript
const { state, recall } = require('./lib/memory');
state('build-count', 42);
recall('build-count');   // 42
```

## Geometric addressing

The store exposes geometry-backed addressing for spatially organized
retrieval. Store at an address and locate it later:

```javascript
const { address, locate } = require('./lib/memory');
await address('The quasicrystal spreads keys without collisions.');
const hit = await locate('the barcode you got back');
```

The addressing scheme itself is documented in [Geometry](/vant/memory/geometry).

## Gating

Store operations run through the sandbox capability gate. A denied session
gets coded refusals instead of silent failures, and every write is atomic:
a crash mid-write never leaves a torn document.
