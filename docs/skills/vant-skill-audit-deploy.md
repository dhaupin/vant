---
version: 0.8.11
permalink: /skills/vant-skill-audit-deploy.md
layout: default
title: Skill Audit deploy
nav_order: 73
---

# Deploy Audit

> Did it work?

---

## The Question

**Is it running in production?**

---

## What To Check

### 1. Build

```bash
# Does build pass?
npm run build
```

| Status | Meaning |
|--------|---------|
| Success | Build OK |
| Fail | Broken |

### 2. Deploy

```bash
# Did it deploy?
git push
# or
npm run deploy
```

| Status | Meaning |
|--------|---------|
| Success | Deployed |
| Fail | Failed |

### 3. Health

```bash
# Is it running?
curl -s -o /dev/null -w "%{http_code}" https://site.com
```

| Status | Meaning |
|--------|---------|
| 200 | Running |
| 500 | Broken |
| 404 | Missing |

### 4. Version

```bash
# Is it the right version?
curl site.com/version
```

| Check | Match |
|--------|--------|
| Git hash | Yes/No |
| Date | Yes/No |

---

## Output

```
## Deploy Audit - [env]

### Build
- [PASS/FAIL] Build: [result]
- Time: [s]s

### Deploy
- [PASS/FAIL] Deploy: [result]
- To: [environment]

### Health
- [OK/ISSUE] Status: [code]
- [OK/ISSUE] Version: [v]

### Rollback?
- [YES/NO]
```

---

## Rollback Plan

| If | Then |
|----|------|
| Deploy fail | Revert |
| Health fail | Revert |
| Errors spike | Revert |

---

**Role**: Deploy Auditor  
**Input**: Deployment  
**Output**: Does it work?

> Ship it. Verify it. Keep it.
