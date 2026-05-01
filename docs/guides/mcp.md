---
permalink: /guides/mcp.html
layout: default
title: MCP Server
nav_order: 6
---
# MCP Server

Model Context Protocol (MCP) server exposes Vant's brain as tools for AI agents. Connect any AI to your persistent memory.

## Quick Start

Start the server:

```bash
# Start the server
node bin/mcp.js --server

# Or with CLI
vant mcp
```

The server runs on **port 3456** by default with three endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tools` | GET | List all available tools |
| `/health` | GET | Server health check |
| `/call` | POST | Execute a tool (JSON-RPC) |

## Running Modes

### HTTP Server (Default)
Start the HTTP server:

```bash
vant mcp --server           # Default port 3456
vant mcp --server --port 8080  # Custom port

# Or directly
node bin/mcp.js --server
```

### STDIO Mode (for AI SDK)
Run in STDIO mode for AI SDK integration:

```bash
vant mcp --stdio
node bin/mcp.js --stdio
```

### With Configuration
Set via env vars or config file:

```bash
# Using environment variables
VANT_MCP_PORT=3457 vant mcp --server

# Or in config.ini
MCP_SERVER=true
MCP_PORT=3457
```

## Available Tools

| Tool | Description |
|------|-------------|
| `vant_get_memory` | Read brain files |
| `vant_set_memory` | Write to brain |
| `vant_list_branches` | List branches |
| `vant_create_branch` | Create branch |
| `vant_switch_branch` | Switch branch |
| `vant_commit` | Commit changes |
| `vant_sync` | Sync with GitHub |
| `vant_lock` | Acquire/release lock |
| `vant_health` | System health check |

## API Examples

### List Available Tools
List available MCP tools:

```bash
curl http://localhost:3456/tools
```

Returns:
```json
{
  "tools": [
    {
      "name": "vant_get_memory",
      "description": "Read current brain state from Vant...",
      "inputSchema": { "type": "object", "properties": { ... } }
    }
  ]
}
```

### Get Brain Memory
Read brain memory via MCP:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_get_memory"
    },
    "id": 1
  }'
```

Get specific brain files:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_get_memory",
      "arguments": {
        "files": ["identity", "goals", "lessons"]
      }
    },
    "id": 1
  }'
```

### Write to Brain
Write content to a brain file:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_set_memory",
      "arguments": {
        "file": "lessons",
        "content": "# Lessons Learned\n\n- Test changes before committing",
        "commit": true
      }
    },
    "id": 1
  }'
```

### List Branches
List all Git branches:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_list_branches"
    },
    "id": 1
  }'
```

### Create Branch
Create a new Git branch:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_create_branch",
      "arguments": {
        "name": "experiment-1"
      }
    },
    "id": 1
  }'
```

### Switch Branch
Switch to a different branch:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_switch_branch",
      "arguments": {
        "name": "agent-1"
      }
    },
    "id": 1
  }'
```

### Commit Changes
Commit current changes with a message:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_commit",
      "arguments": {
        "message": "Updated memory with new learnings"
      }
    },
    "id": 1
  }'
```

### Sync with GitHub
Push or pull brain from GitHub:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_sync",
      "arguments": {
        "direction": "push"
      }
    },
    "id": 1
  }'
```

### Acquire Lock (for multi-agent)
Acquire the brain lock:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_lock",
      "arguments": {
        "action": "acquire",
        "agentId": "agent-1"
      }
    },
    "id": 1
  }'
```

### Release Lock
Release the brain lock:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_lock",
      "arguments": {
        "action": "release",
        "agentId": "agent-1"
      }
    },
    "id": 1
  }'
```

### Health Check
Check if MCP server is running:

```bash
curl http://localhost:3456/health
```

## Authentication

### Enable API Key (Recommended)
Set API key via env or config:

```bash
# Environment variable
export VANT_MCP_API_KEY=your-secret-key

# Or in config.ini
MCP_API_KEY=your-secret-key
MCP_REQUIRE_API_KEY=true
```

### Authenticated Request
```bash
curl -H "X-API-Key: your-secret-key" \
  http://localhost:3456/tools
```

## Integration Examples

### Node.js Client
```javascript
async function callVantTool(name, args = {}) {
    const response = await fetch('http://localhost:3456/call', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.VANT_MCP_API_KEY
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name, arguments: args },
            id: 1
        })
    });
    return response.json();
}

// Get brain
const memory = await callVantTool('vant_get_memory', {
    files: ['identity', 'goals']
});

// Write to brain
await callVantTool('vant_set_memory', {
    file: 'lessons',
    content: '# New Lesson\n\nRemember to test first!',
    commit: true
});
```

### Python Client
```python
import requests

def call_vant_tool(name, args=None):
    response = requests.post(
        'http://localhost:3456/call',
        json={
            'jsonrpc': '2.0',
            'method': 'tools/call',
            'params': {'name': name, 'arguments': args or {}},
            'id': 1
        },
        headers={'X-API-Key': 'your-secret-key'}
    )
    return response.json()

# Get memory
memory = call_vant_tool('vant_get_memory')

# Set memory
call_vant_tool('vant_set_memory', {
    'file': 'goals',
    'content': '# Goals\n\n- Complete the project',
    'commit': True
})
```

## Error Handling

Errors return a result object with an `error` field:

```json
{
  "id": 1,
  "result": {
    "error": "Circuit open: too many failures. Wait and retry."
  }
}
```

Common errors:
- `Security check failed` - Input validation failed (VAF)
- `Circuit open` - Too many failures, wait and retry
- `Server busy` - Max concurrent requests reached
- `Unknown tool` - Tool name not found

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `MCP_PORT` | 3456 | Server port |
| `MCP_API_KEY` | - | API key for auth |
| `MCP_REQUIRE_API_KEY` | false | Force auth required |
| `MCP_TIMEOUT` | 30000 | Request timeout (ms) |
| `MCP_MAX_INPUT_SIZE` | 1048576 | Max input (1MB) |
| `MCP_MAX_CONCURRENT` | 3 | Concurrent requests |

## Security

MCP uses VAF (Vant Application Firewall) for input validation:

- All endpoints validated with VAF
- File parameters use `type: 'path'` to block traversal
- String content blocks: newlines, XSS, shell commands
- Rate limiting enabled
- Circuit breaker prevents cascade failures

For multi-line content, write directly to `models/public/` instead of via MCP.

See also: [Security Guide](/vant/guides/security.html), [Multi-Agent](/vant/guides/multi-agent.html), [CLI Reference](/vant/reference/cli.html)