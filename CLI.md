# vant CLI

A lightweight CLI tool for AI agent session management with GitHub-backed state.

## Installation

```bash
npm install -g vant
# Or use directly
node bin/vant.js <command>
```

## Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant sync` | Pull/push brain from/to GitHub |
| `vant health` | System diagnostics |
| `vant load` | Load brain from models/public |
| `vant run` | Start runtime (long-running agent loop) |
| `vant test` | Run build tests |
| `vant changelog` | View recent changes |
| `vant summary` | Session summary - memory, state, stats |
| `vant watch` | Monitor GitHub for changes (poll) |
| `vant help` | Show all commands with help |
| `vant help <cmd>` | Help for specific command |
| `vant setup` | Interactive setup wizard |
| `vant update` | Check for new Vant releases |
| `vant rate` | Show GitHub API rate limit |
| `vant bump` | Bump version and tag release |
| `vant node` | Run as persistent node |

### Persistent Node

Run Vant as persistent agent node:

```bash
vant node                    # Start node
vant node --mcp              # Start with MCP server
vant node --mcp-port=3457   # Custom MCP port
vant node --poll-interval=30   # Poll GitHub every 30s
vant node --help            # Show usage
```

**Environment:**

```bash
export VANT_GITHUB_REPO=dhaupin/vant
export VANT_GITHUB_TOKEN=ghp_...
vant node --sync
```

| `vant mcp` | Run MCP server for AI tools |

### MCP Server

Run MCP server for AI tool access:

```bash
vant mcp --server        # HTTP server on port 3456
vant mcp --stdio       # STDIO mode
vant mcp --help       # Show usage
```

**Authentication:**

Set API key via environment or config:

```bash
export VANT_MCP_API_KEY=your-secret-key
vant mcp --server
```

Or in `config.ini` (copy from config.example.ini):

```ini
MCP_API_KEY=your-secret-key
```

Requests need `X-API-Key` header:

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:3456/tools
```

| `vant onboard` | Show onboarding summary |
| `vant succession` | Brain succession status |
| `vant bot` | Run Telegram bot |

## Multi-Agent

For multi-agent workflows, see [AGENTS.md](./AGENTS.md) for:
- Branch management (`vant checkout`, `vant commit`)
- Lock coordination to prevent race conditions

## Examples

```bash
# Quick start
vant health
vant start --sync

# Sync manually
vant sync pull
# do work
vant sync push "Made changes"

# Version bump
vant bump patch
git push && git push --tags
```

## For Vant System

Full system at: https://github.com/dhaupin/vant
For full brain with YAML categories: https://github.com/dhaupin/vant-brain

## License

MIT