---
version: 0.8.11
permalink: /skills/vant-skill-test-chaos.md
layout: default
title: Skill Test chaos
nav_order: 129
---

# Test Chaos

> Resilience engineering.

---

## When To Use

- Does it recover?
- Failures in production
- Edge cases

---

## What To Test

### 1. Break Things

| Break | Test |
|--------|-------|
| Database down | Handle gracefully |
| Network timeout | Retry? |
| Service dies | Restart? |

### 2. Chaos Tools

| Tool | Use |
|--------|-------|
| chaos-mesh | K8s chaos |
| Gremlin | Infrastructure |
| Chaos Blade | Cloud |

### 3. Recovery

| Scenario | Expected |
|----------|----------|
| DB fails | Queue + retry |
| API down | Circuit break |
| Timeout | Fallback |

---

## Output

```
## Chaos Test

| Injection | Recovery | Time |
|-----------|----------|-------|
| DB crash | ✓ | 2s |
| Network | ✓ | 5s |
| Service | ✗ | N/A |

### Failure
- [steps to reproduce]
```

> Break it on purpose.