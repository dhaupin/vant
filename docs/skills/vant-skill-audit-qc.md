---
version: 0.8.11
permalink: /skills/vant-skill-audit-qc.md
layout: default
title: Skill Audit qc
nav_order: 100
---

# Quality Control

> Does this meet standards?

---

## What To Check

### 1. Code Quality

```bash
# Check formatting
npm run lint
npm run format

# Check for console.log
grep -rn "console.log" . --include="*.js"
```

| Check | Issue | Severity |
|-------|-------|-----------|
| Lint errors | HIGH | Fail |
| console.log in prod | LOW | Warn |
| No tests | MEDIUM | Warn |

### 2. Types

```bash
# Type errors
npm run type-check
npx tsc --noEmit
```

| Check | Issue | Severity |
|-------|-------|-----------|
| Type error | HIGH | Fail |
| Any type | LOW | Warn |

### 3. Tests

```bash
# Test coverage
npm test
npm run test:coverage
```

| Check | Issue | Severity |
|-------|-------|-----------|
| Tests fail | HIGH | Fail |
| <80% coverage | MEDIUM | Warn |
| No tests | LOW | Warn |

### 4. Build

```bash
# Does it build?
npm run build
```

| Check | Issue | Severity |
|-------|-------|-----------|
| Build fails | HIGH | Fail |
| Build warning | LOW | Warn |

---

## Output

```
## QC Audit - [file]

### Lint
- [PASS/FAIL] Lint: [errors]

### Types
- [PASS/FAIL] Types: [errors]

### Tests
- [PASS/FAIL] Tests: [result]
- Coverage: [x]%

### Build
- [PASS/FAIL] Build: [result]

### Summary
| Check | Result |
|--------|---------|
| Lint   | PASS   |
| Types  | PASS   |
| Tests  | PASS   |
| Build  | PASS   |
```

---

## Standards

| Level | Meaning |
|-------|---------|
| PASS | Ready to merge |
| WARN | Consider fixing |
| FAIL | Block merge |

---

**Role**: QC Auditor  
**Input**: Code to check  
**Output**: Standards met?