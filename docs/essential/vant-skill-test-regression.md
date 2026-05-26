---
version: 0.8.11
permalink: /essential/vant-skill-test-regression
layout: default
title: Skill Test regression
nav_order: 160
---

# Test Regression

> Verify no new breaks.

---

## When To Use

- Before deploy
- After changes
- Release blockers

---

## What To Test

### 1. Run Existing Tests

```bash
npm test           # All tests
pytest           # Python
go test          # Go
```

### 2. Don't Break History

| Test Suite | Status |
|------------|--------|
| Unit | Must pass |
| Integration | Must pass |
| E2E | Must pass |

### 3. Catch Regressions

```
OLD behavior = expected
NEW behavior = broken if different
```

---

## Output

```
## Regression

| Suite | Before | After | Status |
|-------|--------|-------|--------|
| Unit | PASS | PASS | ✓ |
| Integration | PASS | FAIL | REGRESSION |

### Failed
- [tests that changed]
```

---

**Role**: Regression Tester  
**Input**: Test suite  
**Output**: No new failures?

> Don't break what worked.