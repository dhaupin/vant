---
permalink: /nodes.html
---

---
version: 0.8.4
title: Nodes
slug: /nodes
order: 21
---

# Vant Nodes

Run Vant as a persistent node - like crypto nodes, but for AI agents.

## Concept

A **Vant node** is a long-running instance that:
- Runs the same Vant software
- Maintains its own brain state in GitHub
- Polls for remote changes
- Syncs brain on updates

Like crypto nodes:
- Same software, different state
- Each node has its own brain in its own GitHub repo/branch
- No central server - GitHub is the database

## Use Cases

- **Persistent AI** - Keep AI alive across restarts
- **Multi-node deployment** - Run multiple nodes with different brains
- **24/7 agent** - AI that's always running
- **Remote sync** - Brain updates automatically

## Running a Node

```bash
# Basic node
vant node

# With MCP server
vant node --mcp

# Custom MCP port
vant node --mcp --port 3457

# Custom poll interval
vant node --poll-interval 30
```

## Environment

```bash
# Required
VANT_GITHUB_REPO=owner/repo
VANT_GITHUB_TOKEN=ghp_...

# Optional
VANT_MCP_PORT=3456
VANT_POLL_INTERVAL=60
```

## How It Works

1. Load brain from `models/public` or GitHub
2. Start MCP server (optional)
3. Poll GitHub for changes every N seconds
4. On change: pull latest brain
5. Log activity

## Node vs MCP

| Command | What |
|---------|------|
| `vant node` | Persistent node with optional MCP |
| `vant mcp` | Standalone MCP server only |

## Troubleshooting

Node not responding?
```bash
# Check health
curl http://localhost:3456/health

# Restart node
vant node --mcp
```

## See Also

- [MCP Server](./mcp.md) - AI tool access
- [Architecture](./architecture.md) - How it works
- [Multi-Agent](./multi-agent.md) - Multi-node coordination