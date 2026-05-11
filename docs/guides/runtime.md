---
version: 0.8.11
permalink: /guides/runtime
layout: default
title: Programmatic API
nav_order: 3
---

# Runtime API

> Programmatic Vant usage - quick intro. For full API, see [API Reference](/api/api-runtime).

## Quick Start

```javascript
const vant = require('./lib/vant');

// Initialize
await vant.init({ name: 'MyAgent' });

// Think
const result = await vant.think('What should I do?');

// Learn
await vant.learn('key', 'value');

// Commit
await vant.commit('Did work');
```

## Core Functions

| Function | What |
|----------|------|
| `vant.init()` | Initialize agent |
| `vant.think()` | Process with brain |
| `vant.learn()` | Save to brain |
| `vant.get()` | Read from brain |
| `vant.commit()` | Save changes |
| `vant.sync()` | Push to GitHub |

## Full Reference

See [API Reference](/api/api-runtime) for complete documentation:

- All methods with examples
- Error handling
- Options reference
- Type definitions

---

## Related

- [CLI](cli) - Command-line interface
- [MCP](mcp) - MCP server tools
- [Islands](islands) - Lazy-loading
