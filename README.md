# VANT

> Versatile Autonomous Networked Tool - Persistent AI agent memory system

**Vant** persists AI agent memory across sessions via GitHub. Each generation inherits full context from previous sessions. Built for long-running agentic workflows.

🔗 **[vant.creadev.org](https://vant.creadev.org)** | 📦 **[GitHub](https://github.com/dhaupin/vant)** | 📖 **[Docs](https://docs.creadev.org/vant/)**

---

## Quick Start

| Method | For | Install |
|--------|-----|---------|
| Docker | Quick start | `docker run -e GITHUB_TOKEN=... -e GITHUB_REPO=owner/repo dhaupin/vant` |
| Local | Development | `git clone && cp config.example.ini config.ini && node bin/vant.js start` |
| AI Prompt | Self-setup | [Copy prompt below](#ai-prompt-init) |

---

## AI Prompt Init

Copy this to your AI agent to set up Vant:

```
### Vant Setup

I need you to set up Vant (https://github.com/dhaupin/vant) as your persistent brain.

1. Clone the repo:
   git clone https://github.com/dhaupin/vant.git
   cd vant

2. Copy config templates:
   cp config.example.ini config.ini
   cp .env.example .env

3. Configure in config.ini:
   - GITHUB_REPO=your-github-username/your-repo

4. Set GITHUB_TOKEN in .env

5. Run: node bin/vant.js start
```

---

## Features

### Steganography
Hide messages in images for secure transport. RGBA encoding yields 4 bits/pixel.

[Guide →](https://docs.creadev.org/vant/guides/steganography.html)

### Multi-Agent
Branch per agent + file locks for safe concurrent work.

[Guide →](https://docs.creadev.org/vant/guides/multi-agent.html)

### MCP Server
Expose brain tools to AI agents via HTTP or stdio.

[Guide →](https://docs.creadev.org/vant/guides/mcp.html)

### Integrations
Slack, Discord, and Telegram notifications.

[Guide →](https://docs.creadev.org/vant/guides/operations.html)

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain files into context |
| `vant mcp` | Run MCP server |
| `vant node` | Run as persistent node |

[Full CLI Reference →](https://docs.creadev.org/vant/reference/cli.html)

---

## Configuration

### Required
- `GITHUB_REPO=owner/repo` (in config.ini)
- `GITHUB_TOKEN=...` (in .env)

### Optional
- `GITHUB_BRANCH=main`
- `STEGOFRAME_ROOM`, `STEGOFRAME_PASSPHRASE`
- Settings: `HANDLE`, `DIRECTNESS`, `CURRENT_MOOD`

[Config Guide →](https://docs.creadev.org/vant/guides/configuration.html)

---

## Security

Vant includes VAF (Vant Application Firewall) for input validation:

- Path traversal blocking
- Command injection blocking
- Prompt injection filtering
- Rate limiting

[Security Guide →](https://docs.creadev.org/vant/guides/security.html)

---

## Architecture

```
vant/
├── bin/           # CLI commands
│   ├── vant.js    # Entry point
│   ├── mcp.js    # MCP server
│   └── node.js   # Node runner
├── lib/           # Core modules
│   ├── brain.js   # Brain loader
│   ├── lock.js   # Multi-agent lock
│   └── branch.js # Branch management
└── models/
    └── public/   # Default brain (19 files)
```

[Architecture Guide →](https://docs.creadev.org/vant/guides/architecture.html)

---

## Related

- [Docs](https://docs.creadev.org/vant/) - Full documentation
- [Docker Hub](https://hub.docker.com/r/dhaupin/vant) - Official images
- [Stegoframe](https://stegoframe.creadev.org) - Encrypted transport
