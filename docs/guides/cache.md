---
version: 0.8.11
permalink: /guides/cache
layout: default
title: Cache
nav_order: 31
---

# Cache

In-memory cache layer for fast recall.

## What

The cache layer provides session-level caching:

- Fast in-memory storage
- TTL support
- Size limits

## Quick Start

Import cache:

```javascript
const cache = require('./lib/cache');
```

## Set

Store with TTL:

```javascript
cache.set('key', 'value', 60000);  // 60 second TTL
```

Store forever:

```javascript
cache.set('key', 'value', -1);  // Never expire
```

## Get

Retrieve:

```javascript
const value = cache.get('key');
console.log(value); // "value" or undefined
```

## Has

Check existence:

```javascript
const exists = cache.has('key');
console.log(exists); // true | false
```

## Delete

Remove:

```javascript
cache.delete('key');
```

Clear all:

```javascript
cache.clear();
```

## Size

Get cache size:

```javascript
console.log(cache.size());
```

---

## Usage

Cache search results:

```javascript
const cache = require('./lib/cache');

async function searchWithCache(query) {
    const cached = cache.get('search:' + query);
    if (cached) return cached;
    
    const results = await doSearch(query);
    cache.set('search:' + query, results, 60000);
    return results;
}
```

---

## See Also

- [Search](search) - Hybrid search
- [Runtime](runtime) - Programmatic API