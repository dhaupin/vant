---
version: 0.8.11
permalink: /skills/vant-skill-audit-reliability.md
layout: default
title: Skill Audit reliability
nav_order: 78
---

# Reliability

> Can it recover?

---

## The Question

**When it breaks, does it come back?**

---

## What To Check

### 1. Graceful Degradation

```javascript
// What happens when X fails?
try {
  doX()
} catch {
  // Does it fail safe?
  return default
}
```

| Check | Issue | Fix |
|-------|-------|-----|
| No fallback | Everything dies | Add default |
| No retry | One fail = fail | Retry |
| No circuit | Cascade fail | Circuit break |

### 2. Recovery

```javascript
// Can it restart?
process.on('uncaught', () => {
  // Log and restart?
})
```

| Check | Issue | Fix |
|-------|-------|-----|
| No restart | Stay down | Auto-restart |
| No logging | Can't debug | Log it |
| No alerts | Can't know | Alert |

### 3. Data

```javascript
// What if DB fails?
await db.save(x)
// vs
await db.save(x)
.catch(log)
```

| Check | Issue | Fix |
|-------|-------|-----|
| No backup | Lost forever | Back up |
| No transactions | Partial | Use transaction |
| No validation | Bad data | Validate |

### 4. Capacity

| Check | Limit |
|--------|-------|
| Auto-scale | Yes/No |
| Max instances | [n] |
| Queue depth | [n] |

---

## Output

```
## Reliability - [system]

### Failure Mode
- [SAFE/FAIL] If [X] fails: [behavior]

### Recovery
- [YES/NO] Auto-restart
- [YES/NO] Alert on fail
- [YES/NO] Log on fail

### Data
- [YES/NO] Backup
- [YES/NO] Transactions

### Capacity
- [n] max
- Auto-scale: [YES/NO]

### MTTR (mean time to recover)
- Target: [m]min
```

---

**Role**: Reliability Auditor  
**Input**: System  
**Output**: Can recover?

> Plan for failure.
