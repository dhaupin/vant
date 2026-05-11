---
version: 0.8.11
permalink: /skills/vant-skill-audit-ops.md
layout: default
title: Skill Audit ops
nav_order: 75
---

# Ops Audit

> Is it running?

---

## The Question

**Is it up? Is it working?**

---

## What To Check

### 1. Health

```bash
# Is it up?
curl -s -o /dev/null -w "%{http_code}" /health
# or
curl localhost:3000/health
```

| Check | Response |
|-------|-----------|
| 200 | OK |
| 500 | BROKEN |
| Timeout | DOWN |

### 2. Metrics

```bash
# Common endpoints
/readyz
/healthz
/metrics
```

| Metric | What It Shows |
|--------|---------------|
| Memory | Under OOM? |
| CPU | Under load? |
| Requests | Traffic |
| Errors | Failures |

### 3. Logs

```bash
# Check errors
tail -100 logs/app.log | grep -i error
```

| Check | Look For |
|--------|---------|
| Errors | ERROR, FATAL |
| Warnings | WARN |
| Slow | > 1s |

### 4. Resources

```bash
# Is there capacity?
df -h           # disk
free -h         # memory  
uptime          # load
```

| Check | Limit |
|--------|-------|
| Disk | < 80% |
| Memory | < 80% |
| CPU | < 80% |

---

## Output

```
## Ops Audit - [system]

### Health
- [UP/DOWN] Status: [code]
- [UP/DOWN] /readyz: [code]

### Metrics
- Requests: [count/hr]
- Errors: [count/hr]
- Latency: P[95]ms

### Resources
- CPU: [x]%
- Memory: [x]%
- Disk: [x]%

### Issues
- [list]
```

---

## Severity

| Severity | Meaning | Action |
|----------|---------|--------|
| DOWN | Not working | Fix now |
| DEGRADED | Partially working | Fix soon |
| WARNING | Risk | Monitor |

---

**Role**: Ops Auditor  
**Input**: System  
**Output**: Is it running?

> Keep it running.
