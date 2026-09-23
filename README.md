# VANT

> **Agent memory that lives in your repo.**

**v0.8.6** · [Lander](https://vant.creadev.org) · [Docs](https://docs.creadev.org/vant) · [GitHub](https://github.com/dhaupin/vant)

---

## What Is Vant?

Vant gives AI agents a brain: memory files the agent reads when it wakes and writes when it sleeps. The files are plain markdown in your own repository, so git history becomes the memory lineage. Any agent on any stack can use it, because the memory is files and the tool interface is MCP.

Think of it as: **your soul that reincarnates with full memories.** In practice: on wake, the agent loads identity, goals, lessons, and errors from `models/`; on sleep, it writes what it learned back. The next session starts with all of it.

## Three Memory Systems

| System | What it stores | Where |
|--------|----------------|-------|
| **The brain** | Markdown memory files: identity, goals, lessons, errors, preferences | `models/public/<brain>/`, `models/private/<brain>/` |
| **The memory store** | Key-value state and documents, with TTL and sandbox gating | storage layer, per-brain scoped |
| **Brain search** | Semantic retrieval over the corpus: embeddings, rerank, git-backed citations | embeddings over brain files |

Everything is in your repo. Nothing is in someone else's database. If you stop using Vant, the memory is still there, readable with `cat`.

## Quick Start

### For humans: install and start

Install globally, then run the full startup:

```bash
npm install -g vant
vant start
```

`vant start` checks the brain layout (and imports an old single-brain layout automatically), runs health checks, and gets you ready. Configure credentials first with interactive setup if you need them:

```bash
vant setup
```

### For agents: connect over MCP

Start the MCP server:

```bash
vant mcp
```

The server listens on `127.0.0.1:3457` and auto-wires the module surface into tools: brain read and write, memory store, search, migration status. Point any MCP client at it. Agents inheriting a repo should check the layout first:

```bash
vant migrate --status
```

The full agent loop, written to be executed without a human, is [Agent Onboarding](https://docs.creadev.org/vant/getting-started/agent-onboarding).

## Core Features

| Feature | What It Does |
|---------|--------------|
| **Brain** | Markdown memory files, multi-format (md/json/yaml/txt), read API with private-first fallback |
| **Memory store** | Key-value state and documents with TTL, geometric addressing, sandbox-gated writes |
| **Brain search** | Semantic retrieval with pluggable embed providers (hash, local, openai) plus rerank |
| **Citations** | Git-backed receipts for agent claims, rendered into commit footers |
| **Sync** | Push/pull brain state via GitHub API, with rebase conflict detection |
| **MCP Server** | Auto-wired JSON-RPC tools for any MCP client (optional) |
| **Multi-Brain** | Named brains with a stack: switch contexts, series or parallel |
| **Multi-Agent** | Branch-per-agent workflow, up to 4 agents per install |
| **Succession** | Trust levels control how much state each agent generation inherits |
| **Horcrux** | Whole brain embedded in an image, encrypted, restorable anywhere |
| **Security chain** | Sandbox capabilities, input validation, rate limiting, escrow approval on every op |
| **Crash safety** | Write-ahead journal plus atomic writes: a crash never leaves torn memory |

## Headless Mode

Use Vant as a library with a REST API (no MCP required):

```javascript
const vant = require('./lib/vant');

// Start headless server
const result = await vant.startHeadless({ port: 3000, debug: true });
// Returns: { started: true, mode: 'headless', endpoints: { health, tools, brain } }

// Or programmatic API (no server)
await vant.init({ taskId: 'my-task' });
await vant.learn('key', 'content');
const content = await vant.remember('key');
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VANT_MODE` | Force mode: `cli`, `mcp`, or `headless` |
| `VANT_MCP_PORT` | MCP server port |
| `MCP_REQUIRE_KEY` | Require API key for MCP access |

## Upgrading from an older Vant (single-brain layout)

Older versions stored the brain **flat**, all files directly in
`models/public/` with no per-brain folders and no brain stack. Vant ≥0.9
(axolotl) uses a **multi-brain layout**: `models/public/<brain>/`,
`models/private/<brain>/`, and a brain stack in `models/state.json`.

**If you're upgrading, your brain migrates automatically:** `vant start`
detects the old layout on first run, imports it (default brain name
`vant`), and prints a confirmation banner. Nothing is lost.

Prefer to control it yourself, or want a different brain name?

```bash
vant migrate --status             # see what would be imported
vant migrate --dry-run            # preview the moves, touch nothing
vant migrate --brain-name mybrain # name for BOTH scopes (public+private)
vant migrate                      # import (default name: vant)
```

AI agents on the MCP channel can check too: the `brain_migration_status`
tool reports whether a legacy layout is pending, with guidance.

Notes:

- Detection is **content-based** (looks at your actual files), so it's safe
  to run any time, it never fires on an already-multi-brain tree, and a
  second run is always a no-op.
- `vant start --no-migrate` skips the auto-import if you want to migrate
  manually later.
- One name covers both scopes: your old public brain becomes
  `models/public/<name>/` and your old private brain becomes
  `models/private/<name>/`, same brain, same name, two visibility
  scopes, exactly like before but per-brain.
- After migrating, your brain files live in
  `models/public/<brain>/` (and `models/private/<brain>/` once you write
  private state). The old flat files are moved, not copied.

---

## Documentation

Full docs at **[docs.creadev.org/vant](https://docs.creadev.org/vant)**

### Getting Started

- [Quick Start](https://docs.creadev.org/vant/getting-started/quick-start) - 2 min setup
- [Installation](https://docs.creadev.org/vant/getting-started/install) - All methods
- [Setup](https://docs.creadev.org/vant/getting-started/setup) - Configure
- [Agent Onboarding](https://docs.creadev.org/vant/getting-started/agent-onboarding) - The agent wake/work/sleep loop

### Memory

- [The Brain](https://docs.creadev.org/vant/memory/brain) - Memory files and the read API
- [Memory Store](https://docs.creadev.org/vant/memory/memory-store) - Key-value and document memory
- [Brain Search](https://docs.creadev.org/vant/memory/search) - Semantic retrieval and rerank
- [Horcrux](https://docs.creadev.org/vant/memory/horcrux) - Brain in an image

### Runtime

- [Runtime](https://docs.creadev.org/vant/runtime/runtime) - Programmatic API
- [MCP](https://docs.creadev.org/vant/runtime/mcp) - Tools for AI agents

### Reference

- [CLI](https://docs.creadev.org/vant/reference/cli) - All commands
- [Configuration](https://docs.creadev.org/vant/reference/config) - Env options

---

## Links

- **Lander**: [vant.creadev.org](https://vant.creadev.org)
- **Docs**: [docs.creadev.org/vant](https://docs.creadev.org/vant)
- **GitHub**: [github.com/dhaupin/vant](https://github.com/dhaupin/vant)
- **Issues**: [github.com/dhaupin/vant/issues](https://github.com/dhaupin/vant/issues)
