# VANT

> Persistent AI memory via GitHub - each session inherits full context

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
| `MODEL_PATH` | - | `models/public` |
| `MCP_API_KEY` | - | - |

---

## Core Features

| Feature | What It Does |
|---------|--------------|
| **Brain** | Files in GitHub - each session reads context |
| **Memory** | `models/public/` - identity, goals, lessons... |
| **Sync** | Push/pull brain state via GitHub API |
| **MCP Server** | 21 tools for AI agents (optional) |
| **Islands** | Lazy-loadable integrations |
| **Multi-Agent** | Branch-per-agent workflow |

**Optional Features:** Webhooks, Notifications, Steganography

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
