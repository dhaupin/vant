---
version: 0.8.11
permalink: /guides/architecture
layout: default
title: Architecture
nav_order: 6
---

# Architecture

How Vant is designed - persistent memory system using Git.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vant Architecture                          │
│                                                                   │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────┐   │
│  │   AI     │───▶│ bin/    │───▶│ lib/    │───▶│  GitHub    │   │
│  │(Claude) │    │ vant.js  │    │ brain.js│    │ (Storage) │   │
│  └─────────┘    └─────────┘    └─────────┘    └─────────────┘   │
│       │              │              │              │            │
│       │              ▼              ▼              ▼            │
│       │         ┌─────────────────────────────────────────┐    │
│       │         │         models/public/ (Brain)           │    │
│       │         │  identity.md goals.md lessons.md ...   │    │
│       │         └─────────────────────────────────────────┘    │
│       │                                                   │
│       ◀───────────────────────────────────────────────────   │
│                  Session N+1: Read brain                      │
└─────────────────────────────────────────────────────────────────┘
```

## Core Design

Vant uses **Git for persistence** + ** Islands for lazy-loading** + **Branches for isolation**.

### Data Flow

```
Start → Sync from GitHub → Load brain → Think/Learn → Commit → Push to GitHub
  │           │              │         │          │         │
  ▼           ▼              ▼         ▼          ▼         ▼
[Agent]    [Network]    [Storage]  [Search]  [Output]  [Network]
```

## Components

### bin/ - CLI Entry Points

| File | What | Used By |
|------|------|---------|
| vant.js | Main CLI | Users |
| sync.js | GitHub sync | Internal |
| load.js | Brain loader | vant.js |
| health.js | Diagnostics | vant health |
| mcp.js | MCP server | MCP clients |
| webhook.js | Webhooks | External |

### lib/ - Core Modules

| Module | Purpose | Key Functions |
|--------|---------|-------------|
| vant.js | Runtime | init(), think(), learn() |
| brain.js | Storage | get(), set(), sync() |
| storage.js | Abstraction | get(), put(), query() |
| islands.js | Lazy-load | load(), hydrate() |
| branch.js | Isolation | create(), checkout() |
| lock.js | Coordination | acquire(), release() |
| sync.js | GitHub sync | push(), pull() |
| sandbox.js | Security | canRead(), canWrite() |
| qos.js | Rate limit | limit(), breaker() |
| search.js | Search | query(), hybrid() |

### Models Structure

```
models/
├── public/           # Brain (syncs to GitHub)
│   ├── identity.md   # Who you are
│   ├── goals.md     # What you're doing
│   ├── lessons.md   # What you learned
│   ├── preferences.md
│   └── ...
└── v1/              # Pruned versions (LTC)
```

## Execution Flow

### New Session

```javascript
// 1. Sync from GitHub
await vant.sync.pull();

// 2. Load brain
await vant.load();

// 3. Read identity
const identity = await vant.get('identity');

// 4. Think with context
const result = await vant.think('What should I do?');

// 5. Learn new things
await vant.learn('key', 'content');

// 6. Commit
await vant.commit('message');

// 7. Push to GitHub
await vant.sync.push();
```

### MCP Flow

```
HTTP Request (MCP)
    │
    ▼
┌─────────────┐
│  bin/mcp.js │───▶ Parse JSON-RPC
└─────────────┘
    │
    ▼
┌─────────────┐
│   lib/vant  │───▶ Execute tool
└─────────────┘
    │
    ▼
Response
```

## Security Layers

```
Request → VAF (filter) → Sandbox (capabilities) → Escrow (budget) → Execute
            │               │                    │              │
         [block]        [permission]        [budget]      [run]
```

See [Security](security) for details.

## State Management

| State | Where | Purpose |
|-------|-------|---------|
| Agent ID | memory | Current agent |
| Session | vant.js | Runtime context |
| Brain | models/public/ | Persistent |
| Lock | git ref | Coordination |

---

## Related

- [Multi-Agent](multi-agent) - Branch + lock
- [Security](security) - VAF + sandbox
- [Runtime](runtime) - Programmatic API
