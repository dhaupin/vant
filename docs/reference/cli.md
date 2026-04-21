---
version: 0.8.4
title: CLI Reference
slug: /cli
order: 3
---

# CLI Reference

All Vant CLI commands.

## Core Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain from models/public |
| `vant run` | Start runtime loop |

## Development

| Command | Description |
|---------|-------------|
| `vant test` | Run build/tests |
| `vant watch` | Monitor GitHub for changes |

## Setup

| Command | Description |
|---------|-------------|
| `vant setup` | Interactive setup wizard |
| `vant update` | Check for new releases |

## Help & Info

| Command | Description |
|---------|-------------|
| `vant help` | Show all commands |
| `vant help <cmd>` | Help for specific command |
| `vant changelog` | View recent changes |
| `vant summary` | Session summary |
| `vant rate` | GitHub API rate limit |

## Node & MCP

| Command | Description |
|---------|-------------|
| `vant node` | Run as persistent node |
| `vant node --mcp` | Node + MCP server |
| `vant mcp` | Run MCP server |

## Advanced

| Command | Description |
|---------|-------------|
| `vant onboard` | Browse knowledge base |
| `vant succession` | Brain version/trust |
| `vant resolution` | Mark thoughts resolved |
| `vant bump` | Bump version & tag |

See also: [Configuration](./configuration), [API](./api)
