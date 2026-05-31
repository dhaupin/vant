---
version: 0.8.7
permalink: /reference/tmp
layout: default
title: Tmp API
nav_order: 86
---

# Tmp API

Temporary storage for AI-first OS.

## Constructor

```javascript
const Tmp = require('vant/lib/tmp');
const tmp = new Tmp(options);
```

## Methods

| Method | What |
|--------|------|
| `set(key, value)` | Store temp |
| `get(key)` | Retrieve |
| `del(key)` | Delete |
| `clear()` | Clear all |
| `list()` | List keys |
| `size()` | Count |

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `ttl` | 86400000 | Time to live (ms) |
| `dir` | /tmp/vant | Storage dir |
| `maxSize` | 100MB | Max size |

## Usage

```javascript
const tmp = new Tmp();

// Store with TTL
await tmp.set('session', data, { ttl: 3600000 });

// Retrieve
const val = await tmp.get('session');

// Auto-cleanup after TTL
```