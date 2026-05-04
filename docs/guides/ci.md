---
permalink: /guides/ci.html
layout: default
title: CI, Testing & Audit
nav_order: 17
---

# CI, Testing & Audit

Complete guide to Vant's continuous integration, testing, and audit system.

## CI Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VANT CI FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│  │  PUSH    │───▶│  CHECK   │───▶│   TEST   │───▶│ SECURITY │    │
│  │ commit   │    │  files   │    │  ci.js   │    │   VAF    │    │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    │
│                        │            │            │            │          │
│                        ▼            ▼            ▼            ▼          │
│                   ┌──────────────────────────────────────────┐     │
│                   │         VALIDATE + BUILD ARTIFACTS        │     │
│                   └──────────────────────────────────────────┘     │
│                                      │                             │
│                                      ▼                             │
│                   ┌──────────────────────────────────────────┐     │
│                   │            AUDIT (weekly)                │     │
│                   │        bin/audit.js → AUDIT.md           │     │
│                   └──────────────────────────────────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────
```

## Test Runners

### test/ci.js - Fast CI Runner

```
Purpose:    Fast validation (15+ tests, ~5 seconds)
Use:       GitHub Actions, CI pipelines
Command:   node test/ci.js
```

```bash
# Basic run
node test/ci.js

# JSON output (for parsing)
node test/ci.js --json

# Specific tests
node test/ci.js --lib=vaf        # Single lib
node test/ci.js --lib=vaf --lib=lock  # Multiple libs
node test/ci.js --bin=health         # Single bin
```

### test/runner.js - Full Test Runner

```
Purpose:    Comprehensive validation (44 tests)
Use:       Development, pre-release
Command:   node test/runner.js
```

```bash
# Full test run
node test/runner.js

# Verbose output
node test/runner.js --verbose

# Single test
node test/runner.js testName
```

## GitHub Actions Workflows

### .github/workflows/ci.yml

Main CI workflow with 4 parallel jobs:

| Job | Tests | Purpose | Timeout |
|-----|-------|---------|---------|
| **test** | 15+ | Fast CI validation | 2 min |
| **lint** | 30 | Syntax verification | 2 min |
| **security** | 10 | VAF validation | 5 min |
| **validate** | 20 | Smoke tests | 5 min |

#### Running CI Locally

```bash
# Same as GitHub Actions
node test/ci.js

# Check exit codes
node test/ci.js; echo "Exit: $?"
# Exit 0 = success
# Exit 1 = failures
# Exit 2 = warnings
```

### .github/workflows/audit.yml

Scheduled audit workflow:

| Trigger | Schedule |
|---------|----------|
| **Weekly** | Sunday midnight |
| **Manual** | workflow_dispatch |
| **Post-CI** | After CI completes |

```bash
# Generate audit locally
node bin/audit.js --out=AUDIT.md

# JSON output
node bin/audit.js --json
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| **0** | All tests passed | ✅ Success |
| **1** | Test failures | ❌ Fix failures |
| **2** | Warnings only | ⚠️ Review warnings |

## Test Batches

### Batch 1: Pre-Flight

```
✓ node:22      - Node.js version
✓ file:bin/*   - Binary files exist
✓ file:lib/*   - Library files exist
```

### Batch 2: Syntax

```
✓ syntax:lib/*.js    - All libs valid
✓ syntax:bin/*.js   - All bins valid
```

### Batch 3: Libraries

```
✓ lib:vaf.js works   - VAF loads
✓ lib:lock.js works  - Lock loads
✓ lib:branch.js works - Branch loads
... (26 libraries)
```

### Batch 4: Binaries

```
✓ bin:health runs     - Health check
✓ bin:sync runs       - GitHub sync
✓ bin:load runs      - Brain load
... (19 binaries)
```

### Batch 5: Results

```
Results: 15 passed, 0 failed
Exit: 0
```

## Security Tests

VAF (Vant Application Firewall) validation:

### Script Injection

```bash
# These should be BLOCKED
'<script>'           → blocked ✅
'<img onerror=1>'    → blocked ✅
'javascript:alert()' → blocked ✅
```

### Command Injection

```bash
# These should be BLOCKED
'rm -rf /'           → blocked ✅
'| bash'             → blocked ✅
'$(whoami)'          → blocked ✅
'`id`'              → blocked ✅
```

### Path Traversal

```bash
# BLOCKED
'../etc/passwd'      → blocked ✅
'/etc/passwd'        → blocked ✅
'..'                → blocked ✅

# ALLOWED
'models/public'     → allowed ✅
'models/public/*.md' → allowed ✅
```

## Audit System

### bin/audit.js

Auto-generated AUDIT.md:

```bash
# Generate report
node bin/audit.js --out=AUDIT.md
```

### Output Sections

```
1. ARCHITECTURAL AUDIT
   - Core Modules: 26
   - Executables: 25
   - External Deps: 5

2. ENGINEERING AUDIT
   - Test CI: Present
   - CI/CD: GitHub Actions
   - Node: 18+ (.nvmrc)

3. SECURITY AUDIT
   - Input injection: VAF (40+ patterns)
   - Path traversal: VAF
   - Command injection: VAF
   - DoS: Rate limiting

4. QUALITY CONTROL
   - try/catch blocks: ~40

5. EXTERNAL AUDITS
   - GitHub Dependabot
   - npm audit
   - OSV Scanner
   - Semgrep
```

## External Audits (Free)

Run third-party security scanners:

### npm audit

```bash
npm audit
```

### OSV Scanner

```bash
npx osv-scanner .
```

### Semgrep

```bash
npx @semgrep/semgrep --config=auto .
```

## Node.js Requirements

| Version | Status |
|---------|--------|
| **20** | ✅ Recommended (.nvmrc) |
| **18** | ✅ Supported |
| **22** | ✅ Supported |

```bash
# Switch Node version
nvm use 20

# Or from .nvmrc
nvmrc
```

## CI Configuration

### Package.json Scripts

```json
{
  "scripts": {
    "test": "node test/ci.js",
    "test:full": "node test/runner.js",
    "audit": "node bin/audit.js --out=AUDIT.md"
  }
}
```

### .nvmrc

```
20
```

## Troubleshooting

### CI Failures

```bash
# Run locally to debug
node test/ci.js --lib=vaf

# Check specific lib
node -e "require('./lib/vaf')"
```

### Audit Issues

```bash
# Regenerate audit
node bin/audit.js --out=AUDIT.md

# Check output
cat AUDIT.md
```

## See Also

- [Security Guide](/vant/guides/security.html)
- [Operations](/vant/guides/operations.html)
- [Troubleshooting](/vant/guides/troubleshooting.html)