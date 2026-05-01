# vant CLI

> ⚠️ **Deprecated**: See [docs/reference/cli](../docs/reference/cli.md) for latest.

---

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

### Onboarding

View brain knowledge base:

```bash
vant onboard                    # Show summary
vant onboard files             # List brain files
vant onboard read identity     # Read brain file
vant onboard search <term>    # Search brain
vant onboard help            # Show commands
```

### Succession

Brain version and trust management:

```bash
vant succession               # Show status
vant succession trust high   # Set trust level
vant succession help         # Show levels
```

### Resolution

Mark thoughts as resolved/deprecated/rejected:

```bash
vant resolution              # Status summary
vant resolution list         # List resolutions
vant resolution list resolved # Filter by status
vant resolution resolve fears "fear of X" overcame via therapy
vant resolution deprecate goals "old goal" replaced by new
vant resolution reject identity "old belief" ethics changed
vant resolution deltas identity 5
vant resolution help
```

| `vant bot` | Run Telegram bot |

## Multi-Agent

For multi-agent workflows, see [AGENTS.md](./AGENTS.md) for:
- Branch management (`vant checkout`, `vant commit`)
- Lock coordination to prevent race conditions

## compress

Entropy-Patch encoder for token-aware latent transport.

```bash
# Show entropy statistics
vant compress README.md --stats

# Compress file to .vpatch
vant compress README.md
vant compress models/public/goals.md --output models/latent

# Compress directory
vant compress models/public/ --output models/latent --window 16 --threshold 0.9

# Decompress .vpatch back to original
vant compress models/latent/goals.vpatch --decompress
```

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
Vant supports text/json brain files

## License

MIT