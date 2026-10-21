---
version: 0.8.6
permalink: /operations/cache
layout: default
title: Cache
nav_order: 65
---

# Cache

In-memory cache layer for fast recall.

```text
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

`lib/cache.js` exports the `Cache` class - instantiate your own or use
the defaults you pass in:

```javascript
const { Cache } = require('./lib/cache');

const cache = new Cache({
    maxSize: 1000,       // max entries (default 1000)
    defaultTTL: 3600000  // default TTL in ms (default 1 hour)
});

// Tweaks are also possible mid-life:
// cache.configure({ enableCompression: true })
```

## Set

TTL is an options object, in milliseconds:

```javascript
cache.set('key', 'value', { ttl: 60000 });  // expire in 60 seconds

cache.set('key', 'value');  // falls back to defaultTTL (1 hour)
```

Keys are strings (max 256 chars), values up to 10MB. Large string values
are gzipped automatically when compression is enabled.

## Get

```javascript
const value = cache.get('key');
// Returns value or undefined (expired/missing entries return undefined)
```

Reading a key does NOT extend its TTL: expiry is checked against the
deadline stored at `set()` time (the in-module refresh line is a no-op -
`now + (expiry - now)` equals `expiry`). Re-`set()` the key to move the
deadline.

## Remove

```javascript
cache.remove('key');  // delete one entry (there is no delete alias)

cache.clear();        // drop everything
```

---

## Related

- [Storage](/vant/operations/storage) - Persistent storage
- [Efficiency](/vant/advanced/efficiency) - Performance tips