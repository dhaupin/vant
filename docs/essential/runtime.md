---
version: 0.8.11
permalink: /essential/runtime
layout: default
title: Programmatic API
nav_order: 3
---

# Runtime API

> Programmatic Vant usage - quick intro. For full API, see [API Reference](reference/api-runtime).

## Quick Start

```javascript
const vant = require('vant');

// Initialize
await vant.init({ name: 'MyAgent' });

// Think - query brain for context
const result = await vant.think('What should I do?');

// Learn - store new information
await vant.learn('key', 'value');

// Commit - save to brain via git (use branch module)
// const { commit } = require('vant/lib/branch');
// await commit('MyAgent', 'Did work');
```

## Core Functions

| Function | What |
|----------|------|
| `vant.init()` | Initialize agent |
| `vant.think()` | Query brain for context |
| `vant.learn()` | Store to brain (memory) |
| `vant.remember()` | Store persistent (never expire) |
| `vant.act()` | Execute with lock |
| `vant.getState()` | Get agent state |
| `vant.search()` | Search brain |
| `vant.islands()` | Lazy-load integrations |
| `vant.lock()` | Acquire/release lock |
| `vant.audit()` | Log operations |

> **Note**: Git operations (commit, sync) via `require('vant/lib/branch')`

## Full Reference

See [API Reference](/api/api-runtime) for complete documentation:

- All methods with examples
- Error handling
- Options reference
- Type definitions

---

## Related

- [CLI Reference](reference/cli) - Command-line interface
- [MCP Server](integrations/mcp) - MCP server tools
- [Islands](essential/islands) - Lazy-loading integrations

## Next

- [Boot](essential/boot) - Startup sequence
- [Onboard](essential/onboard) - Brain onboarding