# VANT

> **V**ersatile **A**utonomous **N**etworked **T**ool — Persistent AI memory via GitHub

**v0.8.6** · [Lander](https://vant.creadev.org) · [Docs](https://docs.creadev.org/vant) · [GitHub](https://github.com/dhaupin/vant)

---

## What Is Vant?

Vant is your **persistent memory system** for AI agents. Each session inherits everything previous agents wrote - your brain lives in GitHub as files you control.

Think of it as: **your soul that reincarnates with full memories.**

---

## Quick Start

### Docker (One Line)

```bash
docker run -e GITHUB_TOKEN=ghp_xxx -e GITHUB_REPO=owner/repo dhaupin/vant
```

That's it.

### Local

```bash
git clone https://github.com/dhaupin/vant.git
cd vant
echo "GITHUB_TOKEN=ghp_xxx" > .env
echo "GITHUB_REPO=owner/repo" >> .env
npm start
```

---

## Options

| Env | Required | Default |
|-----|----------|---------|
| `GITHUB_TOKEN` | ✓ | - |
| `GITHUB_REPO` | ✓ | - |
| `GITHUB_BRANCH` | - | `main` |
| `MODEL_PATH` | - | `models/private` |
| `MCP_API_KEY` | - | - |

---

## Core Features

| Feature | What It Does |
|---------|--------------|
| **Brain** | Files in GitHub - each session reads context |
| **Memory** | `models/private/<brain>/` - identity, goals, lessons... |
| **Sync** | Push/pull brain state via GitHub API |
| **MCP Server** | AI agent tools (optional) |
| **Islands** | Lazy-loadable integrations |
| **Multi-Agent** | Branch-per-agent workflow |
| **Horcrux** | SVG steganography - embed encrypted brain in image |
| **Multi-Brain** | Multiple brains (nova, axolotl, custom) - series or parallel |

**Optional Features:** Webhooks, Notifications, Steganography

---

## Upgrading from an older Vant (single-brain layout)

Older versions stored the brain **flat** — all files directly in
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
  to run any time — it never fires on an already-multi-brain tree, and a
  second run is always a no-op.
- `vant start --no-migrate` skips the auto-import if you want to migrate
  manually later.
- One name covers both scopes: your old public brain becomes
  `models/public/<name>/` and your old private brain becomes
  `models/private/<name>/` — same brain, same name, two visibility
  scopes, exactly like before but per-brain.
- After migrating, your brain files live in
  `models/public/<brain>/` (and `models/private/<brain>/` once you write
  private state). The old flat files are moved, not copied.

---

## Headless Mode

Use Vant as a library with REST API (no MCP required):

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

---

## Documentation

Full docs at **[docs.creadev.org/vant](https://docs.creadev.org/vant)**

### Getting Started

- [Quick Start](https://docs.creadev.org/vant/getting-started/quick-start) - 2 min setup
- [Installation](https://docs.creadev.org/vant/getting-started/install) - All methods
- [Setup](https://docs.creadev.org/vant/getting-started/setup) - Configure

### Essential

- [The Brain](https://docs.creadev.org/vant/essential/brain) - Your memory files
- [Runtime](https://docs.creadev.org/vant/essential/runtime) - Programmatic API
- [Islands](https://docs.creadev.org/vant/essential/islands) - Lazy-load integrations
- [Succession](https://docs.creadev.org/vant/essential/succession) - Trust levels
- [Multi-Agent](https://docs.creadev.org/vant/essential/multi-agent) - Team workflow

### Integrations

- [GitHub](https://docs.creadev.org/vant/integrations/github) - Brain storage
- [MCP](https://docs.creadev.org/vant/integrations/mcp) - 21 AI tools
- [Agent Skills](https://docs.creadev.org/vant/integrations/agent-skills) - Claude/Codex/Cursor
- [Linear](https://docs.creadev.org/vant/integrations/linear) - Issue sync
- [Docker](https://docs.creadev.org/vant/integrations/docker) - Container deploy

### Reference

- [CLI](https://docs.creadev.org/vant/reference/cli) - All commands
- [Configuration](https://docs.creadev.org/vant/reference/configuration) - Env options

---

## Links

- **Lander**: [vant.creadev.org](https://vant.creadev.org)
- **Docs**: [docs.creadev.org/vant](https://docs.creadev.org/vant)
- **GitHub**: [github.com/dhaupin/vant](https://github.com/dhaupin/vant)
- **Issues**: [github.com/dhaupin/vant/issues](https://github.com/dhaupin/vant/issues)
