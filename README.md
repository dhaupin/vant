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

Vant is not on npm (the `vant` package there is an unrelated Vue UI
library). Clone, install, run the full startup:

```bash
git clone https://github.com/dhaupin/vant.git
cd vant
npm ci
node bin/vant.js start     # or: npm link, then `vant start`
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
| **Multi-Agent** | Branch-per-agent workflow, quota-configurable roster (`agents.maxAgents`, default 10) |
| **Succession** | Trust levels control how much state each agent generation inherits |
| **Horcrux** | Whole brain embedded in an image, encrypted, restorable anywhere |
| **Security chain** | Sandbox capabilities, input validation, rate limiting, escrow approval on every op |
| **Guest auth** | Per-identity tokens for the MCP door (`vant guest issue/list/revoke`): observer/human/agent roles on the sandbox capability vocabulary, denylist revocation, single-use pairing voucher for the headless pod |
| **Crash safety** | Write-ahead journal plus atomic writes: a crash never leaves torn memory |

## Headless Mode

The serving pod (`vant headless`, issue #187): the MCP door IS the headless
API (every registered tool any client gets - no privileged dashboard
surface exists), with a health-only REST sidecar, node discovery
registration, the one auth posture, and a pairing code that redeems once
into an operator guest. Mode is NEVER inferred for an imported module -
a library import claims no mode until a door is actually used - and
`VANT_MODE` still forces explicitly:

```javascript
const vant = require('./lib/vant');

// Start the pod (defaults: MCP door on VANT_MCP_PORT or 3457, REST
// sidecar on VANT_SERVER_PORT or 3456, bind VANT_SERVER_BIND or 127.0.0.1)
const result = await vant.startHeadless({ debug: true });
// Returns: { mode: 'headless', ports, endpoints: { mcp, health },
//            posture, pairing, registered }
// Direct TLS: set VANT_SERVER_CERT/VANT_SERVER_KEY (plaintext HTTP is
// loopback-bound unless you pass allowInsecure posture intentionally).

// Or programmatic API (no server) — memory persistence via learn/remember:
await vant.init({ taskId: 'my-task' });   // boots security layers + habitat
await vant.learn('key', 'content');       // store (category comes from key prefix)
const content = await vant.remember('key'); // recall (cache, then brain)
```

The pod's REST sidecar answers `/health` (and the registered routes);
`GET /tools` answers **410 Gone** there since the #187 retire - browse or
execute tools through the MCP door, whose `/tools` and `/call` aliases
stay live. Full REST routes in
[REST API](docs/reference/rest-api.md) and
[openapi.yaml](docs/openapi.yaml); guest identities in
[Multi-Guest Auth](docs/security/multi-guest-auth.md).

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VANT_MODE` | Force mode: `cli`, `mcp`, or `headless` (default: real doors resolve, imports claim nothing) |
| `VANT_MCP_PORT` | MCP door / headless API port (default `3457`) |
| `VANT_SERVER_PORT` | REST sidecar / `vant server` port (default `3456`) |
| `VANT_SERVER_BIND` | Bind address (default `127.0.0.1`) |
| `VANT_SERVER_CERT` / `VANT_SERVER_KEY` | TLS cert/key for direct HTTPS |
| `VANT_MCP_PORT` | MCP server port (default `3457`) |
| `VANT_MCP_REQUIRE_KEY` | Require API key for MCP access (`true`/`false`) |

## Upgrading from an older Vant (single-brain layout)

Older versions stored the brain **flat**, all files directly in
`models/public/` with no per-brain folders and no brain stack. Current
Vant (the axolotl line, v0.8.6) uses a **multi-brain layout**: `models/public/<brain>/`,
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
- [Locks](https://docs.creadev.org/vant/operations/locks) - Brain lease + write mutex

---

## Links

- **Lander**: [vant.creadev.org](https://vant.creadev.org)
- **Docs**: [docs.creadev.org/vant](https://docs.creadev.org/vant)
- **GitHub**: [github.com/dhaupin/vant](https://github.com/dhaupin/vant)
- **Issues**: [github.com/dhaupin/vant/issues](https://github.com/dhaupin/vant/issues)
