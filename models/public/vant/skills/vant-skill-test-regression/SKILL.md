---
name: test-regression
description: Verify no new bugs introduced since last release. Run full test suite against changes. Use when checking for regressions or before releases.
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# Test Regression

> Verify no new bugs.

## When To Use

- Before release
- After feature freeze
- Per release

## What To Test

### 1. Full Suite

```bash
npm test -- --coverage
```

### 2. Compare Baseline

```bash
npm test -- --compare baseline.json
```

### 3. Critical Paths

- Login
- Payment
- Search
- Save/Edit

---

## Output

```
## Regression Tests

| Category | Before | After | Delta |
|----------|--------|-------|-------|
| Unit | 100 | 100 | 0 |
| Integration | 50 | 49 | -1 |
| E2E | 20 | 20 | 0 |

### New Failures
- [list]
```

**Role**: Regression Tester  
**Input**: Changes  
**Output**: Pass/Fail