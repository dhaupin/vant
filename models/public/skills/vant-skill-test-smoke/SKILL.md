---
name: test-smoke
description: Quick sanity check to verify basic functionality works. Run fastest tests first. Use when needing quick verification before deeper testing.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Test Smoke

> Quick sanity check.

## When To Use

- Before commit
- Pre-deploy check
- Quick verification

## What To Test

### 1. App Starts

```bash
curl -f http://localhost:3000/health || exit 1
```

### 2. API Responding

```bash
curl -f http://localhost:3000/api/version
```

### 3. Database Connected

```bash
psql -c "SELECT 1" || exit 1
```

---

## Output

```
## Smoke Tests

| Check | Status |
|-------|--------|
| App starts | [PASS/FAIL] |
| API responds | [PASS/FAIL] |
| DB connected | [PASS/FAIL] |

### Time
< 30 seconds
```

**Role**: Smoke Tester  
**Input**: Service  
**Output**: Pass/Fail