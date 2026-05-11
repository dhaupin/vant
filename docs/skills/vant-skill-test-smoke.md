---
version: 0.8.11
permalink: /skills/vant-skill-test-smoke.md
layout: default
title: Skill Test smoke
nav_order: 161
---

# Test Smoke

> Quick sanity check.

---

## When To Use

- Before commit
- After small changes
- "Does it even work?"

---

## What To Test

### 1. It Starts

```bash
npm start           # Does it run?
python app.py      # No errors?
go run            # Compiles?
```

### 2. Basic Response

```bash
curl localhost:3000     # Returns 200?
wget http://localhost   # HTML?
```

### 3. Quick Health

| Check | Command |
|--------|---------|
| Server starts | npm start |
| API responds | curl /health |
| DB connects | ping db |

---

## Output

```
## Smoke Test

| Check | Result |
|-------|--------|
| Start | [PASS/FAIL] |
| Health | [PASS/FAIL] |
| DB | [PASS/FAIL] |

### Issues
- [if any]
```

> If smoke fails, nothing works.