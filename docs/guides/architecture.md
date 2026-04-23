---
permalink: /guides/architecture.html
layout: default
title: Architecture
---

# Architecture

## Overview

Vant uses Git for persistent memory across sessions.

```
User's AI → bin/vant.js → lib/brain.js → GitHub
                   ↓
              models/public/ (brain files)
```

## Components

### bin/

| File | Purpose |
|------|---------|
| `vant.js` | CLI entry point |
| `sync.js` | GitHub sync |
| `load.js` | Brain loader |
| `health.js` | Diagnostics |
| `node.js` | Persistent node |

### lib/

| File | Purpose |
|------|---------|
| `config.js` | Config loader |
| `brain.js` | Brain manager |
| `lock.js` | Multi-agent lock |
| `branch.js` | Git branch per agent |
| `vaf.js` | Security layer |
| `protection.js` | Circuit breaker |
| `auto-update.js` | Auto-save |

## Flow

1. `vant start` → health check → sync → load → run
2. Brain files in `models/public/`
3. Commits to GitHub on changes (human/agent initiated)
4. Next session syncs when ready

See also: [Multi-Agent](./vant/multi-agent.md), [Security](./vant/security.md)
