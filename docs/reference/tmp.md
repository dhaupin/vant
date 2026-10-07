---
version: 0.8.6
permalink: /reference/tmp
layout: default
title: Tmp API
nav_order: 135
---

# Tmp API

Scratch-file spaces for an agent install: files under the models root
(optional per-space namespaces), optionally secured (VAF-checked names,
sandbox-gated, audit-logged).

## Constructor

```javascript
const Tmp = require('vant/lib/tmp');
const tmp = new Tmp(options);
```

## Methods

All file methods are async:

| Method | What |
|--------|------|
| `put(name, content)` | Write a scratch file |
| `get(name)` | Read one back |
| `list()` | List scratch files |
| `delete(name)` | Delete one |
| `clear()` | Clear the space |

The same five take a leading `space` name when spaces are used:
`put(space, name, content)` etc.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `name` | 'default' | Space name |
| `maxFileSize` | 1MB | Per-file size cap |
| `maxFiles` | 100 | Per-space file cap |
| `secured` | true | VAF/sandbox gates + audit logging |

(There is no `ttl`, `dir`, or `maxSize` option - scratch files are not
TTL'd; the TTL surface is lib/cache.js.)

## Usage

```javascript
const tmp = new Tmp();

// Write / read / drop
await tmp.put('session-cache', JSON.stringify(data));
const raw = await tmp.get('session-cache');
await tmp.delete('session-cache');

// Key-value in-memory helper (TTL'd, backed by lib/cache)
tmp.cacheSet('session', data, 3600000);
const val = tmp.cacheGet('session');
```