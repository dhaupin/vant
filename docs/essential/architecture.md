---
version: 0.8.6
permalink: /essential/architecture
layout: default
title: Architecture
description: The architecture map - the memory-first agent OS: kernel, processes, transports, governance, and doors, with the lib modules that make each layer real.
nav_order: 37
---

# Architecture

Vant is the memory-first agent OS, built on Git for the soul. Memory stays first: everything the OS does exists so the brain survives and agents live well inside it. The layers, each mapped to real modules below:

| Layer | What it does | Modules |
|------|--------------|---------|
| **Kernel** | boot discipline, disk truth, the fail-closed wall | boot, storage (file + WAL), sandbox, vaf, qos, auth, escrow, gate |
| **Processes** | agents as first-class records with grants | agents, guests, teams, server (sessions) |
| **Transports** | agents talking across processes and machines | crew-bus, relay webhooks, carriers, traveler, MCP + REST doors |
| **Governance** | who may act, in what order, with what approvals | consensus, forum, governance, trust, succession, escrow, market |
| **Surfaces** | the ways humans and agents touch it all | bin/ CLI, web/ dashboard and relays, docs |

Memory is layer zero: the brain files every other layer reads when a session opens and writes before it closes.

```text
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

```text
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
| webhooks.js | Webhooks | External |

### lib/ - Core Modules

| Module | Purpose | Key Functions |
|--------|---------|-------------|
| vant.js | Runtime | init(), think(), learn() |
| brain.js | Storage | read(), write(), loadCorpus() |
| storage.js | Abstraction | getStorage(), FileStorage (read/write/has) |
| islands.js | Lazy-load | load(), hydrate() |
| branch.js | Isolation | create(), checkout() |
| lock.js | Coordination | acquire(), release() |
| sync.js | GitHub sync | pushAll(), pullAny() |
| sandbox.js | Security | canRead(), canWrite() |
| qos.js | Rate limit | limit(), breaker() |
| search.js | Search | query(), hybrid() |
| state-store.js | Protocol-state persistence | hydrate(), persist(), persistMerged() |
| state/tree.js | Content-addressed state tree (#145) | get(), put(), rootHash(), diff() |

### Models Structure

The multi-brain layout (the axolotl line, v0.8.6): per-brain directories plus the active stack in `models/state.json`. Legacy flat trees are imported by `vant migrate` (see the [Migration Guide](/vant/getting-started/migration)).

```text
models/
├── public/<brain>/    # Public brain (syncs to GitHub)
│   ├── identity.md    # Who you are
│   ├── goals.md       # What you're doing
│   ├── lessons.md     # What you learned
│   └── ...
├── private/<brain>/   # Private tree the agent owns
└── state.json         # { "stack": [...], ... }
```

## Execution Flow

### New Session

```javascript
// 1. Pull from GitHub (lib/sync.js)
const sync = require('vant/lib/sync');
await sync.pullAny();

// 2. Load brain
// await vant.load(); // automatic in init()

// 3. Read identity (unified read; private-first with public fallback)
const identity = await vant.brain().read('identity');

// 4. Think with context
const result = await vant.think('What should I do?');

// 5. Learn new things
await vant.learn('key', 'content');

// 6. Commit (via branch module)
const { commit } = require('vant/lib/branch');
await commit('MyAgent', 'Did work');

// 7. Push to GitHub
await sync.pushAll();
```

### MCP Flow

```text
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

```text
Request → Sandbox (capabilities) → VAF (filter) → QoS (rate limit) → Escrow (budget) → Execute
            │                        │              │                  │               │
       [permission]              [block]        [throttle]         [budget]          [run]
```

See [Sandbox](/vant/security/sandbox) and [VAF](/vant/security/vaf) for details.

## State Management

| State | Where | Purpose |
|-------|-------|---------|
| Agent ID | memory | Current agent |
| Session | vant.js | Runtime context |
| Brain | models/private/<brain>/ | Persistent |
| Lock | models/private/.locks/ | Coordination (lease + mutex, see [Locks](/vant/operations/locks)) |

---

## The API surface

Everything above is served through one source of truth - `lib/vant.js` - with thin interfaces on top:

```text
lib/vant.js  <- SOURCE OF TRUTH (common calls)
    |
    +-- Brain: { load, save, list, search, corpus, state }
    +-- Islands: { list, get, create, update, delete }
    +-- Search: { semantic, hybrid, rerank }
    +-- Storage: { read, write, list, exists }
    +-- Stream: { enqueue, poll, complete, fail }
    +-- Config: { get, set }
    +-- Audit: { log, list }
    +-- ... shared logic
    |
    +-> lib/mcp.js   (agent tools over JSON-RPC)
    +-> lib/api.js   (REST endpoints for web tools)
    +-> CLI          (stdin/stdout)
```

### Ownership model

The tool surface is split by ownership - shared calls live in `lib/vant.js` and are delegated to; interface-specific calls live at the edge:

- **Vant-owned (source of truth):** brain, branches, islands, citations, connectors, framework status, config, audit, search, storage, stream, network, tmp, boot, backup, embed.
- **MCP-unique (agent tools):** agent spawn/list/kill, agent and skill protos, delegation, sudo, shell, stego, resolution tracking.
- **REST-unique (web tools):** file ops (drop/get/list/delete), execute, hooks (onBeforeExecute/onAfterExecute/onError), auth (setSecret/requireAuth/authenticate), mode detection, MCP start, tool call.

### Spec alignment

| Interface | Spec | Notes |
|-----------|------|-------|
| MCP | JSON-RPC 2.0 | the full tool catalog |
| REST | OpenAPI 3.x | Subset for web tools |
| Embed | OpenAI-compatible | `/v1/embeddings` |
| Search | RAG-ready | Hybrid + rerank |
| Auth | JWT + API keys | Gate all endpoints |
| Streaming | SSE | Real-time agent updates |

### Implementation pattern

Each subsystem is accessed through the runtime object:

```javascript
const vant = require('./lib/vant');

const brain = vant.brain();
await brain.load('identity');

const islands = vant.islands();
await islands.list();
```

MCP and REST handlers currently import modules directly; the runtime object is the intended delegation target as the surface consolidates.

## Related

- [Branch](/vant/multi-agent/branches) - Git branch isolation
- [Locks](/vant/operations/locks) - Lease + mutex coordination
- [VAF](/vant/security/vaf) - Input filtering
- [Sandbox](/vant/security/sandbox) - Security sandbox

## Next

- [Runtime](/vant/runtime/runtime) - Runtime API
- [Boot](/vant/essential/boot) - Startup sequence