---
version: 0.8.11
permalink: /skills/vant-skill-audit-security.md
layout: default
title: Skill Audit security
nav_order: 103
---

# Security Audit

> Is this safe?

---

## When To Run

- Before deploy
- After adding auth/credentials
- New endpoints
- External inputs

---

## What To Check

### 1. Credentials

```bash
# Hardcoded secrets?
grep -rn "sk-\|api_key\|password\|secret" . --include="*.js"
grep -rn "Bearer\|Token" . --include="*.js"
```

| Check | Issue | Fix |
|-------|-------|-----|
| Hardcoded API key | HIGH | Use env var |
| Password in code | HIGH | Use env |
| Token in logs | MEDIUM | Redact |

### 2. Inputs

```javascript
// Never trust user input
req.params.id
req.body.data
query.string
```

| Check | Issue | Fix |
|-------|-------|-----|
| SQL from input | HIGH | Parameterize |
| Eval input | HIGH | Remove eval |
| Shell from input | HIGH | No shell |
| File from input | HIGH | Validate path |

### 3. Auth

```javascript
// Check auth exists
function protected() {
  if (!req.user) return error
  // Good
}
```

| Check | Issue | Fix |
|-------|-------|-----|
| No auth check | HIGH | Add auth |
| Auth bypassed | HIGH | Fix |
| Weak auth | MEDIUM | Strengthen |

### 4. Network

| Check | Issue |
|-------|-------|
| HTTP not HTTPS | Use HTTPS |
| Credentials in URL | Headers only |
| No CORS | Set CORS |

### 5. Filesystem

```javascript
// Check file access
fs.readFile(userPath)
```

| Check | Issue | Fix |
|-------|-------|-----|
| Path traversal | HIGH | Sanitize |
| Read any file | HIGH | Validate |
| Write anywhere | HIGH | Restrict |

---

## Output

```
## Security Audit - [file]

### Credentials
- [PASS/FAIL] Hardcoded keys: [details]

### Inputs  
- [PASS/FAIL] SQL injection: [details]

### Auth
- [PASS/FAIL] Protected: [details]

### Summary
| Severity | Count |
|----------|-------|
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW     | 0     |
```

---

## Severity

| Severity | Meaning |
|----------|---------|
| HIGH | Exploit - fix now |
| MEDIUM | Risk - fix soon |
| LOW | Note - fix Optional |

---

**Role**: Security Auditor  
**Input**: Code to review  
**Output**: Issues found