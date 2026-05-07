---
name: audit-general
description: Is everything okay?
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# General Audit

> Is everything okay?

---

## Catch-All

When you don't know what to check, check this.

---

## What To Check

### 1. Basic Health

```bash
# Is it up?
curl localhost:3000/health

# Does it respond?
echo "ping" | nc localhost 3000
```

| Check | Response |
|-------|-----------|
| HTTP 200 | OK |
| Other | Issue |
| Timeout | DOWN |

### 2. Dependencies

```bash
# Are deps working?
npm outdated
npm audit
```

| Check | Issue |
|-------|-------|
| Vulnerabilities | Fix |
| Outdated | Update |
| Missing | Install |

### 3. Security Basics

```bash
# Basic checks
grep -rn "password\|secret\|key" . --include="*.js"
```

| Check | Issue |
|-------|-------|
| Secrets in code | Remove |
| Default creds | Change |
| No HTTPS | Add |

### 4. General Code Quality

```bash
# Quick checks
npm run lint
npm test
```

| Check | Issue |
|-------|-------|
| Lint errors | Fix |
| Test fails | Fix |
| No tests | Add |

---

## Output

```
## General Audit

### Health
- [OK/ISSUE] Service: [response]

### Dependencies
- [OK/ISSUE] Vulnerabilities: [count]
- [OK/ISSUE] Outdated: [count]

### Security
- [OK/ISSUE] Secrets: [found]

### Quality
- [OK/ISSUE] Lint: [errors]
- [OK/ISSUE] Tests: [pass/fail]
```

---

**Role**: General Auditor  
**Input**: Anything  
**Output**: Everything OK?

> When in doubt, check it out.
