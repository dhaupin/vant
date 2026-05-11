---
version: 0.8.11
permalink: /guides/cache
layout: default
title: Cache
nav_order: 40
10
---

# Cache

In-memory cache layer for fast recall.

```
┌─────────────────────────────────────────────────────┐
│              Cache Layer                            │
│                                                      │
│  Request ──▶ Cache ──▶ Brain                       │
│      │         │                                    │
│      │    [HIT] │                                    │
│      │         ▼                                    │
│     [MISS]───▶ Load ──▶ Store                      │
└─────────────────────────────────────────────────────┘
```

## Why

- **Speed** - Memory access vs network
- **TTL** - Auto-expire stale data
- **Budget** - Reduce API calls

## Quick Start

```javascript
const cache = require('./lib/cache');
```

## Set

```javascript
// With TTL (60 seconds)
cache.set('key', 'value', 60000);

// No expiry
cache.set('key', 'value', -1);
```

## Get

```javascript
const value = cache.get('key');
// Returns value or undefined
```

## Delete

```javascript
cache.delete('key');

// Clear all
cache.clear();
```

---

## Related

- [Storage](storage) - Persistent storage
- [Efficiency](efficiency) - Performance tips