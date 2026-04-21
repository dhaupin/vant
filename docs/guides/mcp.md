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