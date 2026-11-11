---
version: 0.8.6
permalink: /operations/ci
layout: default
title: CI
description: The CI pipeline - what every PR runs, and how to reproduce it locally.
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

| Workflow | Trigger | Jobs | Status |
|----------|---------|------|--------|
| test.yml | push (main, staging, agent-* and axolotl), pull_request (main, staging, axolotl), weekly schedule, manual | `ci` (tests, security checks, validation) + `crashtest` (the contract battery) | Required |
| docs.yml | push to main, staging, axolotl; manual | Thin caller of the family docs lane (`dhaupin/freestruct` docs-lane.yml @ SHA): builds the Jekyll docs, runs the pinned freestruct + pagefind layers, and deploys to GitHub Pages (main only; the lane gates the deploy) | Auto |
| docker.yml | push to main, tags | Build and push container image | Auto |

CI keeps Actions minutes low: the `ci` job runs tests, security checks, and validation in one job, and the separate `crashtest` job runs the contract battery (`node tests/ci-crashtest-gate.js`) so the two verdicts stay independent. Concurrency is set to `cancel-in-progress`, so a new push cancels the stale run on the same branch or PR instead of queueing behind it. The trigger list follows the branch slate: the staging-rule canon made `staging` the permanent integration branch and retired `develop`, and pushes to `axolotl` are covered because batch passes land there before any PR exists. PR CI keys on the PR's **base** (`main`, `staging`, `axolotl`) - never the head - so every PR into `axolotl` gates, whatever its head branch is called. The old list stopped at `[main, staging]` deliberately: CI was slow then and the minutes were not worth spending on axolotl PRs. CI is fast now, so the gate is back on for all of them.

### Test Workflow

The embedded copy below is the SHAPE (steps compressed, comments trimmed) - the canon lives in `.github/workflows/test.yml` and this page never overrides it:

```yaml
# .github/workflows/test.yml
name: VANT CI

on:
  workflow_dispatch:
  push:
    # The staging rule (poststruct#32's canon, adopted vant-wide):
    # staging is the PERMANENT integration branch. `develop` no longer
    # rides the list; `axolotl` is covered so batch passes never ship
    # ungated.
    branches: [main, staging, 'agent-*', axolotl]
  pull_request:
    branches: [main, staging, axolotl]
  schedule:
    - cron: '0 0 * * 0'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      # checkout+setup-node@v5 (pinned SHAs in the file), node 22, npm ci
      - name: Security checks (tokens + scoped audit)
        run: |
          ! grep -rE "ghp_[a-zA-Z0-9]{36}" . --include="*.js"
          npm audit --omit=dev --audit-level=high   # dev-only lang rides the eyestruct chain
      - name: Run tests
        run: |
          node -e "console.log('vant', require('./package.json').version)"
          node tests/ci.js
          node tests/runner.js
      - name: Eyes gate (eyestruct@1.0 visual ledger, browserless)
        run: npx eyestruct gate
      - name: Packs deep lint (packstruct@1)
        run: npm run packs:lint
      - name: Packs conformance audit (ALLOWED-pinned)
        run: npm run packs:audit
      - name: Surface consistency (no phantom endpoints, links, community doors)
        run: npm run lint:surface
      - name: web/home gate (links, fiction, stat truth)
        run: npm run lint:home
      - name: web/home config pin suite (vitest)
        run: npm ci --prefix web/home && npm --prefix web/home run test:run
      - name: Poststruct audit (the baked-HTML shipped contract)
        run: npm run build:home && npx poststruct audit web/home/dist --json
      - name: govstruct identity gate (lint/check/surface/doctor, offline)
        run: npx govstruct lint && npx govstruct check && npx govstruct surface --verify && npx govstruct doctor
      - name: Dependency ledger census (depstruct - the never-add-deps law)
        run: |
          npm run lint:deps
          node scripts/audit-deps.js --probe jsqr
          node scripts/audit-deps.js --probe crashtest
      - name: changelog parity gate
        run: npm run lint:changelog
      - name: Fiction signatures (wrong-claims regression gate)
        run: npm run lint:claims
      - name: Language gate (prose is English-only)
        run: node scripts/check-language.js
      - name: Docs truthfulness gate (doc promises resolve to real tree)
        run: node scripts/check-docs-truthfulness.js
      - name: Pass-ledger open-items gate
        run: npm run ledger:gate
      - name: Run standalone suites
        run: node tests/run-all.js

  # The SECOND job of the same workflow, independent of ci: the contract
  # battery rides the INSTALLED crashtest package (no clone step).
  crashtest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Install dependencies
        run: npm ci
      - name: Determinism preflight (the no-wall-clock law, flat-greps pack sources)
        run: npx crashtest lint-determinism
      - name: Crashtest gate (contract table + real-harness run root)
        run: node tests/ci-crashtest-gate.js
```

---

## Run Locally

### Install Dependencies

```bash
npm install
```

### Run Tests

The runner surface is documented ONCE, on [Testing](/vant/operations/testing) - the smoke test, the full runner, the coverage summary, and running one suite. CI runs `node tests/ci.js` + `node tests/runner.js` plus every standalone suite via `node tests/run-all.js`; reproducing CI means running those three shapes locally.

### Lint

```bash
# Full lint
npm run lint

# Fix auto-fixable
npm run lint:fix
```

There is no `npm run build` / `build:watch` - Vant is plain Node with no build step. The repo's other gates: `npm run lint:docs`, `npm run lint:surface`, `npm run lint:helpers`, `npm run lint:locks`.

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