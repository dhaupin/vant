# VANT

> Persistent AI memory via GitHub - each session inherits full context

🔗 **[vant.creadev.org](https://vant.creadev.org)** | 📦 **[GitHub](https://github.com/dhaupin/vant)**

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

### MCP Server (Optional)
Expose brain to AI agents via HTTP. Enable with `-e MCP_API_KEY`.

[Guide →](docs/guides/mcp.md)

### Multi-Agent (Optional)
File locks + branch isolation for concurrent agents.

[Guide →](docs/guides/multi-agent.md)

### Steganography (Optional)
Hide messages in images.

[Guide →](docs/guides/steganography.md)

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
