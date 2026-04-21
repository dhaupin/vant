---
permalink: /mcp.html
---


---
version: 0.8.4
title: MCP Server
slug: /mcp
order: 10
---

# MCP Server

Model Context Protocol (MCP) server for Vant.

## Quick Start

```bash
vant mcp              # Start server
vant mcp --stdio     # STDIO mode
vant mcp --websocket # WebSocket mode
```

## Modes

### STDIO Mode

For local development:

```bash
vant mcp --stdio
```

### WebSocket Mode

For network access:

```bash
vant mcp --websocket --port 3000
```

## Tools

| Tool | Description |
|------|-------------|
| vant_load | Load brain files |
| vant_save | Save brain |
| vant_query | Query knowledge |
| vant_sync | Sync with GitHub |

## Example Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "vant_query",
    "arguments": {
      "query": "what are my goals?"
    }
  }
}
```

See also: [CLI Reference](../reference/cli.md), [Architecture](./architecture.md)

---

## FAQ

### What is MCP?

MCP = Model Context Protocol. It's how AI tools talk to external systems.

### Why use MCP with Vant?

Your AI can call Vant tools directly - load brain, query memory, sync changes.

### How do I start MCP?

`vant mcp` - Starts the MCP server on port 3456

### What tools does MCP expose?

| Tool | Description |
|------|-------------|
| vant_load | Load brain |
| vant_query | Query memory |
| vant_sync | Sync with GitHub |

### Do I need an API key?

Yes, set `MCP_API_KEY` in .env for security