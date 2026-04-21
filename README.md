# VANT

> Versatile Autonomous Networked Tool - Persistent AI agent memory system

**Vant** is an open source system for AI agent memory persistence. Each generation inherits the full context from previous sessions via GitHub. Built for long-running agentic workflows.

🔗 **[vant.creadev.org](https://vant.creadev.org)** | 📦 **[GitHub](https://github.com/dhaupin/vant)**

---

## Table of Contents

### Getting Started
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)

### CLI Reference
- [CLI Commands](#cli-commands)
- [Full Reference →](CLI.md)

### How It Works
- [Architecture](#architecture)
- [Security](#security)
- [Multi-Agent](#multi-agent)

### More
- [Docker](#docker-init)
- [GitHub Actions](#github-actions-optional)
- [Related](#related)

---

## Choose Your Init Method

| Method | Best For | Time |
|--------|----------|------|
| [AI Prompt Init](#ai-prompt-init) | AI agents setting up themselves | 2 min |
| [Local Init](#local-init) | Local development, contributors | 5 min |
| [Docker Init](#docker-init) | Containers, quick start | 1 min |

---

## AI Prompt Init

Copy this to your AI agent to set up Vant itself:

```
### Vant Setup

I need you to set up Vant (https://github.com/dhaupin/vant) as your persistent brain.

1. Clone the repo:
   git clone https://github.com/dhaupin/vant.git
   cd vant

2. Copy config templates:
   cp config.example.ini config.ini
   cp .env.example .env
   cp settings.example.ini settings.ini (optional)
   cp mood.example.ini mood.ini (optional)

3. Configure in config.ini:
   - GITHUB_REPO=your-github-username/your-repo
   - GITHUB_BRANCH=main (or create a branch for this agent)

4. Set GITHUB_TOKEN in .env or as environment variable

5. Test: node bin/build-test.js

6. Start: node bin/vant.js start

Important files:
- bin/vant.js - CLI entry point
- bin/sync.js - Pull/push to GitHub
- bin/load.js - Load brain files into context
- bin/health.js - System diagnostics
- lib/config.js - Config loader (reads from config.ini)
- lib/auto-update.js - Auto-save on exit
- lib/lock.js - Multi-agent lock (optional)
- lib/branch.js - Git branch per agent (optional)

Vant persists via GitHub - each generation inherits full memory.
The public repo (vant) has built-in brain loading (text/json).
```

---

## Local Init

```bash
# Clone
git clone https://github.com/dhaupin/vant.git
cd vant

# Setup (interactive)
node bin/setup.js

# Or use templates
cp config.example.ini config.ini
cp .env.example .env
# Edit with your values

# Test
node bin/build-test.js

# Run
node bin/vant.js start
```

---

## Docker Init

### Quick Start
```bash
docker run -e GITHUB_TOKEN=your_token -e GITHUB_REPO=owner/repo dhaupin/vant
```

### Docker Desktop
Click "Run in Docker Desktop" in Docker Hub for one-click launch.

### With Config File
```bash
docker run -v ./config.ini:/app/config.ini dhaupin/vant
```

### Interactive CLI
```bash
docker run -it dhaupin/vant vant help
```

### Pull First
```bash
docker pull dhaupin/vant
docker run dhaupin/vant vant start
```

---

## Configuration

### config.example.ini
Copy to `config.ini`. Required:
- `GITHUB_REPO=owner/repo`

Optional:
- `GITHUB_BRANCH=main`
- `STEGOFRAME_ROOM` and `STEGOFRAME_PASSPHRASE`

### .env
Copy to `.env`:
- `GITHUB_TOKEN=your_personal_access_token`

### settings.example.ini (Optional)
Copy to `settings.ini` to customize personality:
- `HANDLE`, `DISPLAY_NAME`
- `DIRECTNESS`, `CURIOSITY`, `PATIENCE`
- `CURRENT_MOOD=focused|curious|playful|cautious|urgent|contemplative`

### mood.example.ini (Optional)
Copy to `mood.ini` to customize behavior:
- `MOOD`, `ENERGY`, `SOCIABILITY`

---

## CLI Commands

| Command | Description |
|---------|-------------|
| **Core** | |
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain from models/public |
| **Development** | |
| `vant test` | Run build/tests |
| `vant watch` | Monitor GitHub for changes |
| **Setup** | |
| `vant setup` | Interactive setup wizard |
| `vant update` | Check for new releases |
| **Help & Info** | |
| `vant help` | Show all commands |
| `vant help <cmd>` | Help for specific command |
| `vant changelog` | View recent changes |
| `vant summary` | Session summary |
| `vant rate` | GitHub API rate limit |
| **Node & MCP** | |
| `vant node` | Run as persistent node |
| `vant node --mcp` | Node + MCP server |
| `vant mcp` | Run MCP server |
| **Advanced** | |
| `vant onboard` | Browse knowledge base |
| `vant succession` | Brain version/trust |
| `vant resolution` | Mark thoughts resolved |
| `vant bump` | Bump version & tag |

For full command reference, see [CLI.md](CLI.md).

---

## Architecture

```
models/
  public/       # Default brain (19 files)
    identity.md, ego.md, fears.md, anger.md, joy.md    # Core
    manifesto.md, creed.md, goals.md, preferences.md # Values
    lessons.md, qc.md, security.md                 # Learnings + Ops
    audit.md, errors.md, keepers.md               # Operations
    curiosity.md, humility.md, empathy.md, gratitude.md # Humanity
    meta.json, verbosity.ini
bin/
  vant.js       # CLI entry point
  help.js       # Help command
  node.js      # Node runner
  mcp.js       # MCP server
  setup.js     # Interactive setup
  health.js    # Diagnostics
  sync.js      # GitHub sync
lib/
  config.js     # Config loader
  brain.js      # Brain loader
  lock.js       # Multi-agent lock
  branch.js     # Git branch per agent
  auto-update.js # Auto-save context
```

For module reference, see [LIBS.md](LIBS.md).

---

## Security

For VAF security, see [AGENTS.md](AGENTS.md#security).

- No hardcoded credentials in defaults
- Uses environment variables for secrets
- Public model is identity-only, no secrets
- User must configure own credentials

---

## GitHub Actions (Optional)

For Docker Hub push, add these secrets in repo Settings → Secrets → Actions:

| Secret | Where to get |
|--------|--------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | [Create token](https://hub.docker.com/settings/security) |

Without these, build fails on push but tests pass.

---

## Integrations

### Slack/Discord Notifications

Send VANT events to your team's chat:

```javascript
const notifications = require('./lib/notifications');

// Slack
await notifications.slack('Brain synced!', { channel: '#agents' });

// Discord
await notifications.discord('Deploy complete', { embed: true });

// Event notifications
await notifications.event('sync', { branch: 'main', files: 5 });
await notifications.event('health', { status: 'ok' });
```

Environment variables:
- `SLACK_WEBHOOK_URL` - Slack incoming webhook
- `DISCORD_WEBHOOK_URL` - Discord incoming webhook

### Telegram Bot

Run a Telegram bot for VANT control:

```bash
# Set token
export TELEGRAM_BOT_TOKEN=your_bot_token

# Run bot
vant bot
# Or: node bin/bot.js
```

Commands:
- `/start` - Welcome message
- `/status` - Show VANT status
- `/brain` - Show brain version
- `/health` - Run health check
- `/sync` - Trigger brain sync

### MCP Server

Run VANT as an MCP (Model Context Protocol) server exposing brain tools to AI agents:

```bash
# Standalone HTTP server
vant mcp --server
# Or: node bin/mcp.js --server

# With AI SDK (stdio mode)
vant mcp --stdio
# Or: node bin/mcp.js --stdio
```

**HTTP Endpoints:**

| Endpoint | Method | Description |
|----------|--------|------------|
| `/tools` | GET | List available tools |
| `/health` | GET | Server health check |
| `/call` | POST | Execute tool (JSON-RPC) |

**Usage (HTTP):**

```bash
# Start server
vant mcp --server
# Default port: 3456

# List tools
curl http://localhost:3456/tools

# Call tool
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"vant_health"},"id":1}'

# Get memory
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"vant_get_memory","arguments":{}},"id":1}'
```

**Available Tools:**

| Tool | Description |
|------|------------|
| `vant_get_memory` | Read brain files |
| `vant_set_memory` | Write to brain |
| `vant_list_branches` | List branches |
| `vant_create_branch` | Create branch |
| `vant_switch_branch` | Switch branch |
| `vant_commit` | Commit changes |
| `vant_sync` | Sync with GitHub |
| `vant_lock` | Acquire/release lock |
| `vant_health` | Health check |

**Environment:**
- `VANT_MCP_PORT` - Server port (default: 3456)
- `VANT_MCP_API_KEY` - API key for authentication

**Authentication:**
Set `VANT_MCP_API_KEY` or add to `config.ini`:

```bash
# As environment variable
export VANT_MCP_API_KEY=your-secret-key

# Or in config.ini (copy from config.example.ini)
MCP_API_KEY=your-secret-key
```

Requests must include `X-API-Key` header:

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:3456/tools
```

---

## Multi-Agent

VANT supports multiple agents working on the same brain through branching and locking:

- **Branches** - Each agent works on its own Git branch
- **Locks** - File-based locks prevent race conditions
- **MCP Server** - Expose brain tools to AI agents via HTTP

See [AGENTS.md](./AGENTS.md) for detailed multi-agent workflows.

---

## Related

- [Vant](https://github.com/dhaupin/vant) - Source code
- [Vant Docker Hub](https://hub.docker.com/r/dhaupin/vant) - Official images
- [Stegoframe](https://stegoframe.creadev.org) - Encrypted transport
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - Agent runtime