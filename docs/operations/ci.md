---
version: 0.8.6
permalink: /ci.md/ci
layout: default
title: CI
nav_order: 41
---
# CI

Continuous integration for Vant.

```
┌─────────────────────────────────────────────────┐
│              CI Pipeline                         │
│                                                  │
│  push ──▶ lint ──▶ test ──▶ build ──▶ deploy    │
│              ↓         ↓       ↓       ↓          │
│           [fail]    [fail]  [fail]  [main]     │
└─────────────────────────────────────────────────┘
```

---

## GitHub Actions

Vant uses GitHub Actions for CI.

### Workflows

| Workflow | Trigger | What | Status |
|----------|---------|------|--------|
| test.yml | push | Run tests | Required |
| lint.yml | push | Lint code | Required |
| deploy.yml | push to main | Deploy | Auto |

### Test Workflow

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install deps
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### Lint Workflow

```yaml
# .github/workflows/lint.yml
name: Lint

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install deps
      run: npm ci
    
    - name: Lint
      run: npm run lint
```

---

## Run Locally

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Lint

```bash
# Full lint
npm run lint

# Fix auto-fixable
npm run lint:fix
```

### Build

```bash
# Build
npm run build

# Watch mode
npm run build:watch
```

---

## Code Coverage

Required: 80%+

```bash
# Generate coverage report
npm run test:coverage

# View locally
open coverage/lcov-report/index.html
```

---

## Pre-Commit Checks

Run before committing:

```bash
# Single command - runs all checks
npm run pre-commit

# This runs:
# 1. lint
# 2. test
# 3. build
```

---

## Troubleshooting

### Tests Fail

```bash
# Run with verbose output
npm test -- --verbose

# Run single test
npm test -- --grep "specific test"
```

### Lint Errors

```bash
# See detailed errors
npm run lint 2>&1

# Check specific file
npx eslint path/to/file.js
```

---

## Related

- [Testing](testing) - Test guide
- [Release]/operations/release - Release process