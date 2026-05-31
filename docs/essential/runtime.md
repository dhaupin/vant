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
| `vant.shutdown()` | Graceful shutdown |

> **Note**: Git operations (commit, sync) via `require('vant/lib/branch')`

## Submodules

Access via `vant.<submodule>()`:

| Submodule | What | Key Methods |
|----------|------|------------|
| `vant.brain` | Persistent memory | load(), save(), search() |
| `vant.storage` | Storage layer | put(), get(), del() |
| `vant.islands` | Lazy-loaded modules | load(), list(), hydrate() |
| `vant.agents` | Agent management | spawn(), list(), kill() |
| `vant.msg` | Agent messaging | send(), broadcast(), receive() |
| `vant.citations` | Git-backed grounding | cite(), link(), verify() |
| `vant.mcp` | MCP server | start(), stop(), handlers() |
| `vant.embed` | Vector embeddings | embed(), similarity() |
| `vant.compute` | Code execution | execute(), sandbox() |
| `vant.nodeRegistry` | Peer discovery | discover(), list(), announce() |
| `vant.system` | OS status | cpu(), mem(), disk() |
| `vant.metrics` | Performance stats | gauge(), counter(), histogram() |
| `vant.lock` | Distributed lock | acquire(), release() |
| `vant.cache` | Memoization | memoize(), clear() |
| `vant.config` | Configuration | get(), set(), load() |

## v0.8.7+ New Features

### Event System (AI-first)

Vant emits events during operations — subscribe for reactive behavior:

```js
const event = require('./lib/event');

// Subscribe
event.on('agent:initialized', (agent) => { /* agent started */ });
event.on('think:complete', (result) => { /* thought completed */ });
event.on('learn:saved', (data) => { /* new learning */ });

// Trigger: vant.init() → 'agent:initialized'
// Trigger: vant.think() → 'think:complete'
// Trigger: vant.learn() → 'learn:saved'
```

| Event | When | Data |
|-------|------|------|
| `agent:initialized` | vant.init() complete | `{ id, name, role }` |
| `think:complete` | vant.think() done | `{ query, insights, memories }` |
| `learn:saved` | vant.learn() done | `{ key, category }` |
| `module:discovered` | registry built | `{ count, capabilities }` |
| `act:*` | operation lifecycle | `{ opKey, duration }` |

### Discovery Registry

New in v0.8.7 — auto-discover modules:

```js
// Scan all lib/*.js files
const reg = vant.buildRegistry();
// → { modules: Map(63), byCapability: Map(10) }

// Filter by capability
const memMods = vant.discover({ capability: 'memory' });
const secMods = vant.discover({ capability: 'security' });

// Find modules with capability
const memNames = vant.findByCapability('memory'); 
// → ['brain', 'islands', 'storage']
```

### User Extensibility

3 ways to extend without touching core:

| Way | How |
|-----|-----|
| Add to `lib/` | Drop `.js` → auto-discovered |
| Add to `lib/connectors/` | Drop language connector → auto-loaded |
| Event subscriptions | Subscribe/emit anytime — no file needed |

```js
// Example: Listen to agent lifecycle
const event = require('./lib/event');

event.on('agent:initialized', async (agent) => {
    // Custom setup when agent starts
    await doMySetup(agent.id);
});
```

## Full Reference

See [API Reference](reference/api-runtime) for complete documentation:

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