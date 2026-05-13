---
version: 0.8.11
permalink: /skills/vant-skill-test-load.md
layout: default
title: Skill Test load
nav_order: 158
---

# Load Test

> Test performance under load.

---

## When To Use

- Before deploy
- New feature
- Performance regression

---

## What To Check

### 1. Concurrent Users

```bash
# Simulate users
npx autocannon -c 10 -d 20 URL
```

| Users | Target |
|-------|--------|
| 10 | Baseline |
| 100 | Normal |
| 1000 | Peak |

### 2. Response Time

```bash
# Response time under load
npx autocannon URL
```

| P95 | Rating |
|------|--------|
| < 500ms | OK |
| < 1s | Degraded |
| > 1s | Bad |

### 3. Error Rate

```bash
# Error rate
npx autocannon URL | grep -i error
```

| Errors | Rating |
|--------|--------|
| < 1% | OK |
| < 5% | Degraded |
| > 5% | Bad |

---

## Tools

| Tool | Use |
|------|-----|
| autocannon | HTTP load |
| k6 | Scriptable load |
| wrk | Simple load |

---

## Output

```
## Load Test - [URL]

### Baseline (10 users)
- RPS: [n]
- P95: [ms]

### Normal (100 users)
- RPS: [n]
- P95: [ms]

### Peak (1000 users)
- RPS: [n]
- P95: [ms]

### Errors
- [n]%
```

---

**Role**: Load Tester  
**Input**: URL  
**Output**: Performance under load

> Push it to the limit.