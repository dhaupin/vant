---
version: 0.8.6
permalink: /guides/mcp
layout: default
title: MCP Server
nav_order: 17
30
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

The server runs on **port 3456** by default:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tools` | GET | List all available tools |
| `/call` | POST | Execute a tool |
| `/health` | GET | Server health check |

### Port Configuration

**Default: 3456** — Works out of the box. Change via environment:

```bash
# Via environment variable (recommended)
export VANT_MCP_PORT=4000
vant mcp --server

# Via CLI flag
vant mcp --server --port 4000
```

The server uses `VANT_MCP_PORT` from environment, falls back to 3456 if unset.

---

## Remote Access

By default, MCP binds to `127.0.0.1` (localhost only) for security. To expose to network:

```bash
# Bind to all interfaces (REMOTE - but UNENCRYPTED!)
export MCP_BIND_ADDRESS=0.0.0.0
vant mcp --server
```

### TLS / HTTPS

For production remote access, use TLS certificates:

```bash
# With Let's Encrypt or Cloudflare certificates
export VANT_SERVER_CERT=/path/to/cert.pem
export VANT_SERVER_KEY=/path/to/key.pem
vant mcp --server
```

Or use **Caddy** for automatic HTTPS:

```bash
# Caddyfile (place next to Caddyfile in project root)
mcp.yourdomain.com:3456 {
    reverse_proxy localhost:3456
}
```

Then run Caddy:
```bash
caddy run
```

Caddy automatically provisions free TLS certificates!

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | 3456 | Server port |
| `MCP_BIND_ADDRESS` | 127.0.0.1 | Bind address |
| `VANT_SERVER_CERT` | - | TLS certificate path |
| `VANT_SERVER_KEY` | - | TLS key path |
| `VANT_SERVER_INSECURE` | false | Allow HTTP (dev only) |

---

## Security Chain

MCP uses a security chain for all requests:

1. **VAF** - Input validation, path traversal protection
2. **Rate-Limit** - Per-IP request limiting
3. **Auth** - API key validation (optional)
4. **Escrow** - Budget checks for writes

```bash
# Require API key
VANT_SERVER_AUTH_REQUIRED=1 vant mcp --server
```

### Failed Attempts

After 5 failed auth attempts, access is locked for 60 seconds.

---

## Unified API

MCP uses the **unified lib/api.js** for consistent execution:

- **Hooks**: Pre/post execution hooks for logging
- **Auth**: Unified authentication with lockout after 5 failures
- **Mode**: MCP mode detection for framework

```javascript
// Debug MCP hooks (optional)
VANT_DEBUG=1 vant mcp --server
```

### Authentication

Uses unified API with lockout:
- 5 failed attempts triggers 60-second lockout
- Set `VANT_API_KEY` in environment
- Pass key via JSON-RPC params:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "vant_get_memory",
    "apiKey": "your-key"
  }
}
```

---

## REST API Reference

### Base URL

```
http://localhost:3456
```

### Authentication

Pass API key in header:

```bash
curl -H "Authorization: Bearer $VANT_API_KEY" http://localhost:3456/tools
```

### List Tools (`GET /tools`)

```bash
curl http://localhost:3456/tools
```

Response:
```json
{
  "tools": [
    {
      "name": "vant_get_memory",
      "description": "Read brain memory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "file": { "type": "string", "description": "Brain file name" }
        }
      }
    }
  ]
}
```

### Execute Tool (`POST /call`)

Execute any tool via JSON-RPC:

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_get_memory",
      "arguments": { "file": "identity.md" }
    },
    "id": 1
  }'
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": "# NAME: MyAgent\n\nPURPOSE: ..."
  }
}
```

### Health Check (`GET /health`)

```bash
curl http://localhost:3456/health
```

---

## Tool Reference

### Core Tools (9)

| Tool | Description | Parameters |
|------|-------------|------------|
| `vant_get_memory` | Read brain file | `file` (string) |
| `vant_set_memory` | Write brain file | `file`, `content` |
| `vant_list_branches` | List branches | - |
| `vant_create_branch` | Create branch | `name` |
| `vant_switch_branch` | Switch branch | `name` |
| `vant_commit` | Commit changes | `message` |
| `vant_sync` | Push/pull | - |
| `vant_lock` | Lock brain | `token` |
| `vant_health` | Health check | - |

### Extended Tools (11)

| Tool | Description | Parameters |
|------|-------------|------------|
| `vant_get_islands` | List islands | - |
| `vant_load_island` | Load island | `name` |
| `vant_resolution_track` | Track decision | `id`, `outcome` |
| `vant_stego_encode` | Encode stego | `text`, `image` |
| `vant_stego_decode` | Decode stego | `image` |
| `vant_config_get` | Get config | `key` |
| `vant_config_set` | Set config | `key`, `value` |
| `vant_audit_log` | Log audit | `action`, `details` |
| `vant_audit_list` | List audit | `filters` |
| `vant_succession_info` | Trust config | - |
| `vant_search` | Search brain | `query`, `mode` |

---

## Error Codes

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `UNKNOWN` | 500 | true | Unknown error |
| `CONFIG_MISSING` | 500 | false | Missing config |
| `CONFIG_INVALID` | 400 | false | Invalid config |
| `GITHUB_AUTH` | 401 | false | Auth failed |
| `GITHUB_NOT_FOUND` | 404 | false | Not found |
| `GITHUB_RATE_LIMIT` | 429 | true | Rate limited |
| `GITHUB_SYNC_FAIL` | 500 | true | Sync failed |
| `BRAIN_LOAD_FAIL` | 500 | true | Load failed |
| `BRAIN_SAVE_FAIL` | 500 | true | Save failed |
| `NETWORK_TIMEOUT` | 504 | true | Timeout |
| `NETWORK_OFFLINE` | 503 | true | Offline |
| `LOCK_TIMEOUT` | 409 | false | Lock conflict |
| `LOCK_FAILED` | 409 | false | Lock error |
| `STEGO_ENCODE_FAIL` | 500 | false | Encode failed |
| `STEGO_DECODE_FAIL` | 500 | false | Decode failed |

Error response format:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": "BRAIN_LOAD_FAIL",
    "message": "Failed to load brain"
  },
  "id": 1
}
```

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

| Tool
- Description |
|------|-------------|
| `vant_get_memory`
- Read brain files |
| `vant_set_memory`
- Write to brain |
| `vant_list_branches`
- List branches |
| `vant_create_branch`
- Create branch |
| `vant_switch_branch`
- Switch branch |
| `vant_commit`
- Commit changes |
| `vant_sync`
- Sync with GitHub |
| `vant_lock`
- Acquire/release lock |
| `vant_health`
- System health check |
| `vant_search`
- Search brain (basic/rag/hybrid) |
| `vant_get_islands`
- List brain islands |
| `vant_load_island`
- Load specific island |
| `vant_resolution_track`
- Track thought resolutions |
| `vant_stego_encode`
- Encode data in image |
| `vant_stego_decode`
- Decode stego image |
| `vant_config_get`
- Get config value |
| `vant_config_set`
- Set config value |
| `vant_audit_log`
- Write audit log |
| `vant_audit_list`
- List audit entries |
| `vant_succession_info`
- Get succession state |

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
      "inputSchema": { "type": "object" |
- "properties": { ... } }
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
        "files": ["identity" |
- "goals" |
- "lessons"]
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
async function callVantTool(name |
- args = {}) {
    const response = await fetch('http://localhost:3456/call' |
- {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.VANT_MCP_API_KEY
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name |
- arguments: args },
            id: 1
        })
    });
    return response.json();
}

// Get brain
const memory = await callVantTool('vant_get_memory' |
- {
    files: ['identity' |
- 'goals']
});

// Write to brain
await callVantTool('vant_set_memory' |
- {
    file: 'lessons',
    content: '# New Lesson\n\nRemember to test first!',
    commit: true
});
```

### Python Client
```python
import requests

def call_vant_tool(name |
- args=None):
    response = requests.post(
        'http://localhost:3456/call',
        json={
            'jsonrpc': '2.0',
            'method': 'tools/call',
            'params': {'name': name |
- 'arguments': args or {}},
            'id': 1
        },
        headers={'X-API-Key': 'your-secret-key'}
    )
    return response.json()

# Get memory
memory = call_vant_tool('vant_get_memory')

# Set memory
call_vant_tool('vant_set_memory' |
- {
    'file': 'goals',
    'content': '# Goals\n\n- Complete the project',
    'commit': True
})
```

### Search Brain
Search brain via MCP (3 modes):

```bash
# Basic text search
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_search",
      "arguments": {
        "query": "python",
        "mode": "basic"
      }
    },
    "id": 1
  }'
```

RAG mode with rehydration:

```bash
# Semantic search + rehydrate (default 5 results)
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_search",
      "arguments": {
        "query": "authentication",
        "mode": "rag",
        "limit": 3
      }
    },
    "id": 1
  }'
```

Compact mode (summaries only, faster):

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_search",
      "arguments": {
        "query": "python",
        "mode": "rag",
        "compact": true
      }
    },
    "id": 1
  }'
```

Hybrid mode (BM25 + Vector + RRF):

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "vant_search",
      "arguments": {
        "query": "python",
        "mode": "hybrid"
      }
    },
    "id": 1
  }'
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
- `Circuit open` - Too many failures |
- wait and retry
- `Server busy` - Max concurrent requests reached
- `Unknown tool` - Tool name not found

## Configuration Options

| Setting
- Default
- Description |
|---------|---------|-------------|
| `MCP_PORT`
- 3456
- Server port |
| `MCP_API_KEY`
- -
- API key for auth |
| `MCP_REQUIRE_API_KEY`
- false
- Force auth required |
| `MCP_TIMEOUT`
- 30000
- Request timeout (ms) |
| `MCP_MAX_INPUT_SIZE`
- 1048576
- Max input (1MB) |
| `MCP_MAX_CONCURRENT`
- 3
- Concurrent requests |

## Security

MCP uses VAF (Vant Application Firewall) for input validation:

- All endpoints validated with VAF
- File parameters use `type: 'path'` to block traversal
- String content blocks: newlines |
- XSS |
- shell commands
- Rate limiting enabled
- Circuit breaker prevents cascade failures

For multi-line content, write directly to `models/public/` instead of via MCP.

## Related

- [Security Guide](security) - Input validation
- [Multi-Agent](multi-agent) - Branch workflow
- [CLI Reference](reference/cli) - All commands