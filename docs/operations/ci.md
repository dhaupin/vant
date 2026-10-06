---
version: 0.8.6
permalink: /operations/ci
layout: default
title: CI
nav_order: 62
---
# CI

Continuous integration for Vant.

```text
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
| test.yml | push, pull_request, weekly schedule, manual | Tests, security checks, validation | Required |
| docs.yml | push to main | Build and deploy docs to GitHub Pages | Auto |
| docker.yml | push to main, release branches, tags | Build and push container image | Auto |

CI is one job by design: tests, security checks, and validation run in a
single `ci` job to keep GitHub Actions minutes low. Concurrency is set to
`cancel-in-progress`, so a new push cancels the stale run on the same
branch or PR instead of queueing behind it.

### Test Workflow

```yaml
# .github/workflows/test.yml
name: VANT CI

on:
  workflow_dispatch:
  push:
    branches: [main, develop, 'agent-*']
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 0'  # Weekly (default branch only, single job = cheap)

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Security checks (tokens + npm audit)
        run: |
          ! grep -rE "ghp_[a-zA-Z0-9]{36}" . --include="*.js"
          npm audit --audit-level=high

      - name: Run tests
        run: |
          node -e "console.log('vant', require('./package.json').version)"
          node test/ci.js
          node test/runner.js
          node test/evals/vibe.js
          node test/coverage.js

      - name: Run standalone suites
        run: for f in test/*.test.js; do node "$f" || exit 1; done
```

---

## Run Locally

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
# Smoke tests
npm test

# Full runner
node test/runner.js

# Coverage summary
node test/coverage.js

# One suite
node test/brain.test.js
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

```bash
# Coverage summary across suites
node test/coverage.js
```

---

## Pre-Commit Checks

Run before committing:

```bash
# Syntax check every lib, bin, and test file
npm run check

# Lint
npm run lint

# Smoke tests
npm test
```

---

## Troubleshooting

### Tests Fail

```bash
# Run the full runner for details
node test/runner.js

# Run one suite to isolate
node test/brain.test.js
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

- [Testing](/vant/operations/testing) - Test guide
- [Release](/vant/advanced/release) - Release process