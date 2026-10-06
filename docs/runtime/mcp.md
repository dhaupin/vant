---
version: 0.8.6
permalink: /runtime/mcp
layout: default
title: MCP Server
nav_order: 33
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

The MCP server runs on port **3457** by default:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/tools` | GET | List all available tools (alias: `/tools`) |
| `/mcp/exec` | POST | Execute a tool |
| `/health` | GET | Server health check |

### Connect a client

Full MCP clients (Claude Desktop, Cursor, and similar) speak stdio. Point
them at the command, not a URL:

```json
{
  "mcpServers": {
    "vant": {
      "command": "vant",
      "args": ["mcp", "--stdio"]
    }
  }
}
```

Callers that prefer raw HTTP do not need an MCP client at all. Browse the
catalog, then execute one tool:

```bash
curl -s http://127.0.0.1:3457/mcp/tools

curl -s -X POST http://127.0.0.1:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_get_memory", "args": {"category": "learnings", "filename": "lessons"}}'
```

Responses are plain JSON: `{"result": ...}` on success, `{"error": ...}` on
failure. The JSON-RPC 2.0 `tools/call` envelope is a REST-server thing
(`POST /call` on port 3456), not an MCP-server thing.

### Port Configuration

**Default: 3457**, Works out of the box. Change via environment:

```bash
# Via environment variable (recommended)
export VANT_MCP_PORT=4000
vant mcp --server

# Via CLI flag
vant mcp --server --port 4000
```

The server uses `VANT_MCP_PORT` from environment, falls back to 3457 if unset.

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
mcp.yourdomain.com:3457 {
    reverse_proxy localhost:3457
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
| `VANT_MCP_PORT` | 3457 | Server port |
| `VANT_MCP_BIND` | 127.0.0.1 | Bind address |
| `VANT_MCP_REQUIRE_KEY` | false | Require auth on POSTs |
| `VANT_MCP_API_KEY` | - | The API key itself |
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
# Require API key on POSTs
VANT_MCP_REQUIRE_KEY=1 vant mcp
```

### Failed Attempts

After 5 failed auth attempts, access is locked for 60 seconds.

---

## Unified API

MCP uses the **unified lib/api.js** for consistent execution:

- **Hooks**: Pre/post execution hooks for logging
- **Auth**: Unified authentication with lockout after 5 failures
- **Mode**: MCP mode detection for framework

```bash
# Run the MCP server with debug output (always on in this mode)
vant mcp
```

### Authentication

Open on loopback by default. Require a key for POSTs, then send it in a
header (never as a tool argument):

```bash
# Require keys
VANT_MCP_REQUIRE_KEY=1 vant mcp

# The key itself: env var, or `vant config set mcp.apiKey <key>`
export VANT_MCP_API_KEY=your-secret-key

curl -X POST http://localhost:3457/mcp/exec \
  -H "x-api-key: $VANT_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_health"}'
```

After 5 failed auth attempts, access is locked for 60 seconds (lockouts
persist across restarts). A valid habitat token (`vant_...`) also satisfies
the gate.

---

## HTTP Endpoints

The MCP server also speaks plain HTTP: two real endpoints and two kept
aliases.

| Method | Path | What |
|--------|------|------|
| GET | `/mcp/tools` | List registered tools with input schemas |
| POST | `/mcp/exec` | Execute one tool |
| GET | `/tools` | Legacy alias of `/mcp/tools` |
| GET | `/health` | Liveness ping (`{ "status": "ok" }`) |

### List tools

```bash
curl http://localhost:3457/mcp/tools
```

### Execute a tool

The exec body accepts both the flat shape and a JSON-RPC-style shape:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_get_memory", "args": {"file": "identity.md"}}'

# Same call, JSON-RPC style
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"method": "vant_get_memory", "params": {"file": "identity.md"}}'
```

Responses are plain JSON: `{"result": ...}` on success, `{"error": ...}` on
failure. There is no `tools/call` envelope and no `POST /call` route.

### Authentication

Open on loopback by default. `vant config set mcp.requireKey true` (or env
`VANT_MCP_REQUIRE_KEY=true`) requires `x-api-key` or `Authorization: Bearer`
on POSTs; habitat tokens (`vant_...`) are accepted too and anchor the
request to its RLS subject:

```bash
curl -H "Authorization: Bearer $VANT_API_KEY" http://localhost:3457/mcp/tools
```

The curated REST route table (brain, streams, trust, market) is a separate
embedder surface on port 3456: [REST API Reference](/vant/reference/rest-api),
wire map in [RPC](/vant/advanced/rpc).

---

## Tool Reference

### MCP Tools

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

### Extended Tools (12)

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
| `vant_rerank` | Rerank results | `query`, `topK` |

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
vant mcp --server           # Default port 3457
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
| `vant_search` | Search brain (basic/rag/hybrid) |
| `vant_get_islands` | List brain islands |
| `vant_load_island` | Load specific island |
| `vant_resolution_track` Track thought resolutions |
| `vant_stego_encode` Encode data in image |
| `vant_stego_decode` Decode stego image |
| `vant_config_get` Get config value |
| `vant_config_set` Set config value |
| `vant_audit_log` Write audit log |
| `vant_audit_list` List audit entries |
| `vant_succession_info` Get succession state |

## API Examples

### List Available Tools
List available MCP tools:

```bash
curl http://localhost:3457/tools
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
Read a brain file via MCP (category plus filename):

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_get_memory", "args": {"category": "learnings", "filename": "lessons"}}'
```

### Write to Brain
Write content to a brain file (category, filename, content):

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_set_memory", "args": {"category": "lessons", "filename": "pass-137", "content": "# Lessons Learned\n\n- Test changes before committing"}}'
```

### List Branches
List all brain branches:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_list_branches"}'
```

### Create Branch
Create a new brain branch:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_create_branch", "args": {"name": "experiment-1"}}'
```

### Switch Branch
Switch the active brain:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_switch_branch", "args": {"name": "agent-1"}}'
```

### Commit Changes
Commit current changes with a message:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_commit", "args": {"message": "Updated memory with new learnings"}}'
```

### Sync with GitHub
Push or pull the brain from GitHub:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_sync", "args": {"direction": "push"}}'
```

### Acquire Lock (for multi-agent)
Acquire the brain lock:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_lock", "args": {"action": "acquire", "agentId": "agent-1"}}'
```

### Release Lock
Release the brain lock:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_lock", "args": {"action": "release", "agentId": "agent-1"}}'
```

### Health Check
Check if MCP server is running:

```bash
curl http://localhost:3457/health
```

## Authentication

### Enable API Key (Recommended)
Set the key via env or brain config:

```bash
# Environment variable
export VANT_MCP_API_KEY=your-secret-key

# Or via config
vant config set mcp.apiKey your-secret-key
vant config set mcp.requireKey true
```

### Authenticated Request
```bash
curl -H "x-api-key: your-secret-key" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3457/mcp/exec \
  -d '{"tool": "vant_health"}'
```

## Integration Examples

### Node.js Client
```javascript
async function callVantTool(tool, args = {}) {
    const response = await fetch('http://localhost:3457/mcp/exec', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.VANT_MCP_API_KEY
        },
        body: JSON.stringify({ tool, args })
    });
    return response.json();
}

// Get brain
const memory = await callVantTool('vant_get_memory', {
    category: 'learnings',
    filename: 'lessons'
});

// Write to brain
await callVantTool('vant_set_memory', {
    category: 'lessons',
    filename: 'new-lesson',
    content: '# New Lesson\n\nRemember to test first!'
});
```

### Python Client
```python
import requests

def call_vant_tool(tool, args=None):
    response = requests.post(
        'http://localhost:3457/mcp/exec',
        json={'tool': tool, 'args': args or {}},
        headers={'x-api-key': 'your-secret-key'}
    )
    return response.json()

# Get memory
memory = call_vant_tool('vant_get_memory', {'category': 'learnings', 'filename': 'lessons'})

# Set memory
call_vant_tool('vant_set_memory', {
    'category': 'goals',
    'filename': 'current',
    'content': '# Goals\n\n- Complete the project'
})
```

### Search Brain
Search the brain via MCP. The base tool takes a query and a limit:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_search", "args": {"query": "python", "limit": 3}}'
```

Hybrid mode (BM25 + Vector + RRF) is its own tool:

```bash
curl -X POST http://localhost:3457/mcp/exec \
  -H "Content-Type: application/json" \
  -d '{"tool": "vant_search_hybrid", "args": {"query": "authentication", "topK": 5}}'
```

The other flavors (`vant_search_semantic`, `vant_search_multiquery`,
`vant_search_hyde`) follow the same pattern. What each mode does and when
to reach for it: [Brain Search](/vant/memory/search).

## Error Handling

Errors come back two ways. A tool-level error rides inside the result:

```json
{
  "result": {
    "error": "Circuit open: too many failures. Wait and retry."
  }
}
```

A thrown handler error replaces the body entirely:

```json
{
  "error": "Brain not found"
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
| `VANT_MCP_PORT` | 3457 | Server port |
| `VANT_MCP_BIND` | 127.0.0.1 | Bind address |
| `VANT_MCP_API_KEY` | - | API key for auth |
| `VANT_MCP_REQUIRE_KEY` | false | Force auth on POSTs |

## Security

MCP uses VAF (Vant Application Firewall) for input validation:

- All endpoints validated with VAF
- File parameters use `type: 'path'` to block traversal
- String content blocks: newlines, XSS, shell commands
- Rate limiting enabled
- Circuit breaker prevents cascade failures

For multi-line content, write directly to `models/private/` instead of via MCP.

## Related

- [Security Guide](/vant/security/) - Input validation
- [Multi-Agent](/vant/multi-agent/agents) - Branch workflow
- [CLI Reference](/vant/reference/cli) - All commands