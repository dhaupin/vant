# VANT

> Persistent AI memory via GitHub - v0.8.6 - each session inherits full context

🔗 **[Lander](https://vant.creadev.org)** | 📄 **[Docs](https://docs.creadev.org/vant)** | 📦 **[GitHub](https://github.com/dhaupin/vant)**

---

## Quick Start

### Docker (One Line)

```bash
docker run -e GITHUB_TOKEN=ghp_xxx -e GITHUB_REPO=owner/repo dhaupin/vant
```

Done. That's it.

### What Gets Configured

| Env | Required | What |
|-----|----------|------|
| GITHUB_TOKEN | ✓ | GitHub token (repo scope) |
| GITHUB_REPO | ✓ | Owner/repo for brain |
| MODEL_PATH | - | Default: models/public |
| STATE_PATH | - | Default: states/active/current.json |
| MCP_API_KEY | - | Only if using MCP |
| GITHUB_BRANCH | - | Default: main |

---

## Running

### Docker

```bash
# Run once
docker run -e GITHUB_TOKEN=... -e GITHUB_REPO=... dhaupin/vant

# Persistent mode (keeps brain in sync)
docker run -d -e GITHUB_TOKEN=... -e GITHUB_REPO=... dhaupin/vant

# With MCP server
docker run -e GITHUB_TOKEN=... -e GITHUB_REPO=... -e MCP_API_KEY=... -p 3456:3456 dhaupin/vant vant mcp
```

### Local

```bash
git clone https://github.com/dhaupin/vant.git
cd vant
echo "GITHUB_TOKEN=ghp_xxx" > .env
echo "GITHUB_REPO=owner/repo" >> .env
npm start
```

---

## Features

### Agent Skills (agentskills.io)
Export brain as skill for Claude Code, Codex, Cursor. [Guide →](docs/guides/agent-skills.md)

### MCP Server (Optional)
21 tools for AI agents (memory, branches, config, audit, search, rerank). [Guide →](docs/guides/mcp.md)

### Islands (Optional)
Lazy-loadable integrations: GitHub, GitLab, Linear, Stego. [Guide →](docs/guides/islands.md)

### Multi-Agent (Optional)
Branch-per-agent workflow + trust levels. [Guide →](docs/guides/multi-agent.md)

### Webhooks (Optional)
Inbound server + event triggers + filters. [Guide →](docs/guides/webhooks.md)

### Notifications (Optional)
Slack, Discord, Email, Pushover, Telegram. [Guide →](docs/guides/notifications.md)

### Steganography (Optional)
Hide messages in PNG with AES-256-GCM. [Guide →](docs/guides/steganography.md)

---

## Full Docs

- [CHANGELOG](docs/CHANGELOG.md) - Version history
- [Deprecations](docs/deprecations.md) - Files planned for removal

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Token error | Ensure `repo` scope |
| Not syncing | Check GITHUB_REPO format |
| MCP fails | Set MCP_API_KEY |

---

## Airgapped Init

Copy this to your AI agent:

```
### Vant Airgapped Setup

Set up Vant (https://github.com/dhaupin/vant) for persistent memory:

1. Clone: git clone https://github.com/dhaupin/vant.git
2. Create .env:
   GITHUB_TOKEN=ghp_your_token
   GITHUB_REPO=owner/repo
3. Run: npm start

To sync brain: vant sync
To load brain: vant load
```

---

## Full Options

Edit `.env` for all options:

```
# Required
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=owner/repo

# Optional (defaults work)
GITHUB_BRANCH=main
MODEL_PATH=models/public
STATE_PATH=states/active/current.json
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360

# Optional features
MCP_API_KEY=secret
```
# Test change
# test
new
