---
name: test-load
description: Test system performance under load. Measure response time, throughput, and resource usage. Use when testing scale, capacity planning, or performance requirements.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Test Load

> Performance under load.

## When To Use

- Scale testing
- Capacity planning
- SLA validation

## Metrics

| Metric | Target |
|--------|--------|
| Response time | < 200ms |
| Throughput | > 1000 rps |
| Error rate | < 1% |

## Load Test

```yaml
scenarios:
  - name: users
    users: 1000
    ramp: 60s
    duration: 300s
```

---

## Tools

| Tool | Use |
|------|-----|
| k6 | Load testing |
| Locust | Python load |
| JMeter | Apache load |
| Artillery | Node load |

---

## Output

```
## Load Test

| Metric | Value | Target |
|--------|-------|--------|
| RPS | [n] | >1000 |
| P95 | [n]ms | <200ms |
| Errors | [n]% | <1% |
```

**Role**: Load Tester  
**Input**: Load profile  
**Output**: Performance