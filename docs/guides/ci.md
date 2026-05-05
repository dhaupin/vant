---
version: 0.8.6
permalink: /guides/ci.html
layout: default
title: CI
nav_order: 17
---
# CI

Continuous integration for Vant.

---

## GitHub Actions

Vant uses GitHub Actions for CI.

### Workflows

| Workflow | Trigger | What |
|----------|---------|------|
| test.yml | push | Run tests |
| deploy.yml | push to main | Deploy |

---

## Run Tests Locally

```bash
npm test
```

---

## Lint

```bash
npm run lint
```

---

## Build

```bash
npm run build
```

---

## See Also

- [Testing](guides/testing)
- [Release](guides/release)
