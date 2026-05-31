---
name: audit-ci
description: Does CI work?
license: MIT
metadata:
  author: vant
  version: "1.0"
---

# CI Audit

> Does CI work?

---

## What To Check

### 1. Pipeline Exists

```bash
# Common CI files
ls .github/workflows/
ls .gitlab-ci.yml
ls Jenkinsfile
ls .circleci/config.yml
```

| File | CI |
|------|-----|
| .github/workflows/*.yml | GitHub |
| .gitlab-ci.yml | GitLab |
| Jenkinsfile | Jenkins |
| .circleci/config.yml | Circle |

### 2. Pipeline Runs

```bash
# Check recent runs
gh run list
```

| Status | Meaning |
|--------|---------|
| ✓ success | Working |
| ✗ failure | Broken |
| ○ pending | Running |

### 3. Pipeline Steps

```yaml
jobs:
  build:
    steps:
      - run: npm test
      - run: npm build
```

| Check | Issue |
|-------|-------|
| Tests run | No tests |
| Build runs | No build |
| Deploy runs | No deploy |

### 4. Caching

```yaml
- uses: actions/cache@v3
  with:
    path: node_modules
```

| Check | Issue | Fix |
|-------|-------|-----|
| No cache | Slow builds | Add cache |
| Cache all | Inefficient | Cache key |

---

## Output

```
## CI Audit

### Pipeline
- [PRESENT/MISSING] File: [file]
- [PASS/FAIL] Last run: [status]

### Steps
- [YES/NO] Test
- [YES/NO] Build
- [YES/NO] Deploy

### Timing
- Test: [s]s
- Build: [s]s
- Total: [s]s

### Issues
- [list]
```

---

**Role**: CI Auditor  
**Input**: Repository  
**Output**: CI works?

> Keep CI green.
