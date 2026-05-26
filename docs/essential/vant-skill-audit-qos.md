---
version: 0.8.11
permalink: /essential/vant-skill-audit-qos
layout: default
title: Skill Audit qos
nav_order: 101
---

# Quality of Service

> Does it work well?

---

## The Question

**Does it work reliably? Is it fast enough?**

---

## What To Check

### 1. Availability

```bash
# Uptime check
curl -s -o /dev/null -w "%{http_code}" /health
```

| Uptime | Rating |
|--------|--------|
| 99.9% | OK |
| 99% | Warning |
| <99% | Bad |

### 2. Latency

```bash
# Response time
time curl -s -o /dev/null URL
```

| Latency | Rating |
|--------|--------|
| < 100ms | Great |
| < 500ms | OK |
| > 1s | Slow |

### 3. Errors

```bash
# Error rate
errors / requests
```

| Errors | Rating |
|--------|--------|
| < 0.1% | Great |
| < 1% | OK |
| > 1% | Bad |

### 4. Capacity

| Metric | Limit | Alert |
|--------|-------|-------|
| Requests | < 80% | Warning |
| Connections | < 80% | Warning |
| Memory | < 80% | Ok |

---

## Output

```
## QoS - [service]

### Availability
- Uptime: 99.9%
- SLA: 99.9%

### Latency
- P50: [ms]ms
- P95: [ms]ms  
- P99: [ms]ms

### Error Rate
- [x]% errors
- [x] errors in [y] requests

### Current Load
- Requests: [x]/s (of [y])
- Connections: [x] (of [y])

### SLA Met?
- [YES/NO]
```

---

## SLA Guide

| SLA | Downtime/Month |
|-----|----------------|
| 99% | 7h 18m |
| 99.9% | 43m |
| 99.99% | 4m |

---

**Role**: QoS Auditor  
**Input**: Service  
**Output**: Does it meet SLA?

> Keep it reliable.