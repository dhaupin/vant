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
| `vant mcp` | Run MCP server for AI tools |
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