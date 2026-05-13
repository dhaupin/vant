---
version: 0.8.11
permalink: /essential/vant-skill-review-efficiency.md
layout: default
title: Skill Review efficiency
nav_order: 145
---

# Efficiency Review

> Is this efficient?

---

## The Question

**What does it cost to run?**

Money. Time. Resources.

---

## What To Check

### 1. Compute

```javascript
// What's the cost?
// CPU time per request
// Memory per request
```

| Resource | High | Fix |
|----------|------|-----|
| CPU | Loop complex | Optimize |
| Memory | Store all | Stream |
| GPU | N/A | N/A |

### 2. Network

```javascript
// How many calls?
callAPI()  // 1
callAPI()  // 2
```

| Pattern | Issue | Fix |
|--------|-------|-----|
| Multiple calls | Round trips | Batch |
| Large payloads | Bandwidth | Compress |
| No compression | Raw | gzip |

### 3. Storage

```javascript
// What are we storing?
db.save(everything)
// vs
db.save(needed)
```

| Pattern | Issue | Fix |
|--------|-------|-----|
| Save all | Extra storage | Save needed |
| Keep forever | bloat | TTL/expiry |
| No index | Slow reads | Index |

### 4. API Calls

```bash
# External APIs cost
curl api.com  // $$
curl api.com  // $$
```

| Check | Issue | Fix |
|-------|-------|-----|
| No cache | Pay each time | Cache |
| Same call twice | Redundant | Dedup |
| No batching | N calls | Batch |

---

## Cost Estimate

```javascript
// Estimate: (calls × cost) + (compute × cost) + (storage × cost)
```

| Item | Calculation |
|------|-------------|
| API calls | calls × $0.001 |
| Compute | hours × $0.05 |
| Storage | GB × $0.02 |

---

## Output

```
## Efficiency - [system]

### Compute
- [ESTIMATE] $[/hr]
- Issue: [pattern]

### Network
- [ESTIMATE] $[/hr]
- Issue: [pattern]

### Storage
- [ESTIMATE] $[/mo]
- Issue: [pattern]

### Total
- Estimated: $[/mo]

### Savings
1. [fix] saves $[/mo]
```

---

**Role**: Efficiency Reviewer  
**Input**: System  
**Output**: Cost?

> Efficiency is money.