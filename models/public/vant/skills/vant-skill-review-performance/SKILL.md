---
name: review-performance
description: Is it fast?
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Performance Review

> Is it fast?

---

## Rule #1

**Measure. Don't guess.**

```bash
# Profile before you optimize
node --prof app.js
```

---

## What To Check

### 1. Time

```javascript
// Time operations
const start = Date.now()
doThing()
console.log(Date.now() - start)
```

| Check | Target |
|---------|--------|
| API < 200ms | |
| Page < 1s | |
| Build < 30s | |

### 2. Network

```bash
# Check size
curl -s -o /dev/null -w "%{size_download}" URL
```

| Size | Rating |
|------|--------|
| > 1MB | SLOW |
| > 500KB | MEDIUM |
| < 100KB | FAST |

### 3. Queries

```javascript
// N+1 query?
items.map(i => db.get(i.id))
```

| Pattern | Issue | Fix |
|---------|-------|-----|
| query in loop | N+1 | Batch |
| select * | Too much | Select needed |
| no cache | Repeat | Cache |

### 4. Async

```javascript
// Blocking?
await heavy()
await more()
```

| Pattern | Issue | Fix |
|---------|-------|-----|
| Sequential | Slow | Promise.all |
| No timeout | Hang | Timeout |
| No limit | OOM | Limit |

---

## Output

```
## Performance - [endpoint]

### Timing
- [TIME] [endpoint]: [ms]ms
- Target: [target]ms

### Network
- [SIZE] [kb]kb

### Queries
- [COUNT] queries for [records]
- Issue: [pattern]

### Recommendations
1. [fix 1]
2. [fix 2]
```

---

## Fix Priority

| Priority | When |
|----------|------|
| 1 | Blocks user |
| 2 | Noticeable delay |
| 3 | Optimization |

---

**Role**: Performance Reviewer  
**Input**: Code or endpoint  
**Output**: Is fast?

> Measure it. Fix what matters.
