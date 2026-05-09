---
version: 0.8.6
permalink: /reference/rest-api
layout: default
title: REST API Reference
nav_order: 14
---
# REST API Reference

Complete REST API documentation for Vant headless integration.

---

## Base Configuration

| Env Variable | Description | Default |
|-------------|-------------|---------|
| `VANT_API_KEY` | API authentication | - |
| `VANT_MCP_PORT` | HTTP server port | 3456 |
| `VANT_MODE` | Mode: cli, mcp, headless | headless |
| `GITHUB_TOKEN` | GitHub auth token | - |
| `GITHUB_REPO` | Repository owner/repo | - |

---

## Endpoints

### GET /tools

List all available MCP tools.

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
          "file": { "type": "string" }
        }
      }
    }
  ]
}
```

### POST /call

Execute a tool via JSON-RPC 2.0.

```bash
curl -X POST http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VANT_API_KEY" \
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

Success response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "content": "..." }
}
```

Error response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": "BRAIN_LOAD_FAIL",
    "message": "Failed to load brain"
  }
}
```

### GET /health

Health check.

```bash
curl http://localhost:3456/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "0.8.6"
}
```

### GET /ready

Readiness check.

```bash
curl http://localhost:3456/ready
```

---

## Tool Examples

### Read Brain File

```javascript
async function getMemory(file) {
  const res = await fetch('http://localhost:3456/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VANT_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'vant_get_memory', arguments: { file } },
      id: 1
    })
  });
  const json = await res.json();
  return json.result?.content;
}
```

### Write Brain File

```javascript
async function setMemory(file, content) {
  const res = await fetch('http://localhost:3456/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VANT_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'vant_set_memory',
        arguments: { file, content }
      },
      id: 1
    })
  });
  return res.json();
}
```

### Search Brain

```javascript
async function search(query, mode = 'hybrid') {
  const res = await fetch('http://localhost:3456/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'vant_search',
        arguments: { query, mode }
      },
      id: 1
    })
  });
  return res.json();
}
```

---

## Rate Limiting

| Plan | Requests/min |
|------|---------------|
| Free | 60 |
| Pro | 600 |
| Enterprise | 6000 |

Rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640000000
```

---

## SDK Usage

### Python SDK

```python
import requests

VANT_URL = "http://localhost:3456"

def call_tool(name, arguments):
    res = requests.post(
        f"{VANT_URL}/call",
        json={
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
            "id": 1
        },
        headers={"Authorization": f"Bearer {os.environ['VANT_API_KEY']}"}
    )
    return res.json()

# Read brain
call_tool("vant_get_memory", {"file": "identity.md"})

# Write brain
call_tool("vant_set_memory", {"file": "lessons.md", "content": "..."})
```

### JavaScript SDK

```javascript
const fetch = require('node-fetch');
const VANT_URL = 'http://localhost:3456';

async function callTool(name, arguments) {
  const res = await fetch(`${VANT_URL}/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VANT_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments },
      id: 1
    })
  });
  return res.json();
}

// Read brain
await callTool('vant_get_memory', { file: 'identity.md' });

// Write brain
await callTool('vant_set_memory', { file: 'lessons.md', content: '...' });
```

---

## WebSocket Events

Subscribe to real-time events via Socket.IO:

```javascript
const io = require('socket.io-client')('http://localhost:3456');

io.on('connect', () => {
  console.log('Connected to Vant');
});

io.on('brain:change', (data) => {
  console.log('Brain changed:', data.file);
});

io.on('sync:complete', (data) => {
  console.log('Sync complete:', data.branch);
});

io.on('error', (error) => {
  console.error('Error:', error);
});
```

### Events

| Event | Description |
|-------|-------------|
| `brain:change` | Brain file modified |
| `brain:save` | Brain saved to disk |
| `sync:start` | Sync started |
| `sync:complete` | Sync completed |
| `sync:error` | Sync error |
| `lock:acquired` | Lock acquired |
| `lock:released` | Lock released |

---

See also: [MCP Guide](guides/mcp), [CLI Reference](reference/cli)