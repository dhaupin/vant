# Vant RPC Protocol Standards

Unified protocol specifications for Vant agent messaging across surfaces.

---

## Table of Contents

1. [MCP Theme Protocol](#mcp-theme-protocol) - JSON-RPC presentation hints
2. [Skill Chain Protocol](#skill-chain-protocol) - Agent↔Skill communication
3. [Agent Chain Protocol](#agent-chain-protocol) - Multi-agent delegation
4. [Extension Guide](#extension-guide) - How to add new protocols

---

## MCP Theme Protocol

**Status**: ✅ Implemented v0.8.6
**Surface**: JSON-RPC (MCP/REST)

### Overview

Standard presentation hints for JSON-RPC responses. Enables clients to render consistent UI states (success/error/loading) with icons and colors.

### Motivation

MCP protocol is pure data (JSON). Clients rendering responses lack context on how to display: success/fail, icons, formatting expectations.

### Specification

#### Response Structure

```javascript
{
  jsonrpc: "2.0",
  result: { ...data },        // Required: actual response
  _theme?: {                  // Optional: presentation hints
    status: State,            // "success" | "error" | "warning" | "loading" | "info"
    icon: string,             // Unicode: "✓", "✗", "⚠", "◌", "ℹ"
    format: Format,          // "text" | "markdown" | "html"
    color: string,           // Hex: "#22C55E"
    priority?: number,       // 1-5, sort order for lists
    meta?: object           // Extension: custom rendering hints
  },
  id?: number|string|null
}
```

#### States

| Status | Icon | Color | Usage |
|--------|------|-------|-------|
| success | ✓ | #22C55E | Operation completed |
| error | ✗ | #EF4444 | Operation failed |
| warning | ⚠ | #EAB308 | Partial success / needs attention |
| loading | ◌ | #3B82F6 | Async in progress |
| info | ℹ | #6B7280 | Informational |

#### Formats

| Format | Client Behavior |
|--------|--------------|
| text | Plain text display |
| markdown | Render MD to HTML styled |
| html | Direct HTML injection |

#### Example: Success

```json
{
  "jsonrpc": "2.0",
  "result": {
    "name": "learnings",
    "status": "written"
  },
  "id": 1
}
```

**With theme:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "name": "learnings",
    "status": "written"
  },
  "_theme": {
    "status": "success",
    "icon": "✓",
    "color": "#22C55E",
    "format": "text"
  },
  "id": 1
}
```

#### Example: Error

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Brain not found",
    "_theme": {
      "status": "error",
      "icon": "✗",
      "color": "#EF4444"
    }
  },
  "id": null
}
```

#### Example: Rich Content

```json
{
  "result": {
    "content": "## Session Summary\n\n**Completed:** 5 tasks\n**Next:** wire MCP theme"
  },
  "_theme": {
    "status": "success",
    "format": "markdown",
    "priority": 1
  }
}
```

### Implementation

#### Theme Constants (lib/theme.js)

```javascript
const STATUS_ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  loading: '◌',
  info: 'ℹ'
};

const STATUS_COLORS = {
  success: '#22C55E',
  error: '#EF4444',
  warning: '#EAB308',
  loading: '#3B82F6',
  info: '#6B7280'
};
```

#### Helper Functions

```javascript
// Apply theme to any MCP response
applyToMCP: (result, options = {}) => ({
  ...result,
  _theme: {
    status: options.status || 'info',
    icon: options.icon || STATUS_ICONS[options.status],
    format: options.format || 'text',
    color: options.color || STATUS_COLORS[options.status]
  }
})

// Shorthand builders
mcp: {
  success: (result) => applyToMCP(result, { status: 'success', icon: '✓', color: '#22C55E' }),
  error: (result, message) => applyToMCP({ error: message, ...result }, { status: 'error', icon: '✗', color: '#EF4444' }),
  warn: (result, message) => applyToMCP({ warning: message, ...result }, { status: 'warning', icon: '⚠', color: '#EAB308' }),
  loading: (result) => applyToMCP(result, { status: 'loading', icon: '◌', color: '#3B82F6' }),
  info: (result) => applyToMCP(result, { status: 'info', icon: 'ℹ', color: '#6B7280' }),
}
```

#### Server Integration (lib/mcp.js)

```javascript
const theme = require('./theme');

async function handleRequest(handler, params) {
  try {
    const result = await handler(params);
    return theme.mcp.success(result);  // Auto-wrap
  } catch (e) {
    return theme.mcp.error({}, e.message);
  }
}
```

### Client Handling

Clients MUST:
- Ignore unknown `_theme` fields (forward compat)
- Use `_theme` fields if present for rendering

Clients MAY:
- Interpret colors for terminal/web styling
- Parse format: markdown→HTML, html→direct render
- Sort by priority for list displays

### Backward Compatibility

`_theme` is OPTIONAL:
- All existing responses remain valid
- Clients falling back gracefully
- Servers can adopt incrementally

---

## Skill Chain Protocol

**Status**: 📋 Planned
**Surface**: HTTP ↔ agentskills.io

### Overview

Protocol for invoking remote skills via Vant skill chain.

### Motivation

Skills may live locally or at remote endpoints. Need unified invocation format.

### Specification

#### Request

```javascript
{
  rpc: "skill_invoke",
  skill: string,           // "github", "linear", "slack", etc
  method: string,          // "create_issue", "list_tasks", etc
  params: object,         // Skill-specific arguments
  context?: {             // Execution context
    agent?: string,       // Calling agent ID
    session?: string,    // Session ID
    ttl?: number          // Timeout seconds
  }
}
```

#### Response

```javascript
{
  rpc: "skill_response",
  skill: string,
  result?: any,
  error?: {
    code: number,
    message: string
  },
  meta?: {
    duration_ms: number,
    cached: boolean
  }
}
```

### Example

```json
{
  "rpc": "skill_invoke",
  "skill": "github",
  "method": "create_issue",
  "params": {
    "repo": "dhaupin/vant",
    "title": "Add MCP theme support",
    "body": "RFC: docs/RPC.md"
  },
  "context": {
    "agent": "agent-001",
    "ttl": 30
  }
}
```

### Response

```json
{
  "rpc": "skill_response",
  "skill": "github",
  "result": {
    "number": 42,
    "html_url": "https://github.com/dhaupin/vant/issues/42"
  },
  "meta": {
    "duration_ms": 450,
    "cached": false
  }
}
```

---

## Agent Chain Protocol

**Status**: 📋 Planned
**Surface**: Internal / Anthropic Messages API

### Overview

Protocol for multi-agent delegation and communication.

### Motivation

Vant supports multiple agents. Need standard message format for:
- Spawn: Create new sub-agent
- Delegate: Assign task to agent
- Broadcast: Message all agents
- Terminate: Clean shutdown

### Specification

#### Messages

```javascript
{
  rpc: "agent_message",
  type: MessageType,
  payload: {
    // Spawn
    name?: string,         // Agent name
    role?: string,        // "assistant", "specialist"
    
    // Delegate
    agent?: string,       // Target agent ID
    task?: string,      // Task description
    
    // Broadcast
    channel?: string,   // Channel name
    
    // Query
    query?: string,     // RAG query
  },
  context?: {
    trace?: boolean,    // Include trace data
    priority?: number   // 1-5
  }
}
```

#### Message Types

| Type | Direction | Description |
|------|----------|------------|
| spawn | Controller→Agent | Create new agent |
| delegate | Agent→Agent | Assign task |
| broadcast | Any→All | Channel message |
| query | Agent→Brain | RAG lookup |
| terminate | Controller→Agent | Shutdown agent |
| status | Any→Controller | Health/check |

#### Example: Spawn

```json
{
  "rpc": "agent_message",
  "type": "spawn",
  "payload": {
    "name": "Claude",
    "role": "assistant"
  }
}
```

#### Example: Delegate

```json
{
  "rpc": "agent_message",
  "type": "delegate",
  "payload": {
    "agent": "agent-claude",
    "task": "Refactor lib/theme.js to use class syntax"
  }
}
```

#### Example: Delegate with Response

```json
{
  "rpc": "agent_message",
  "type": "delegate",
  "payload": {
    "agent": "agent-claude",
    "task": "Update CHANGELOG",
    "_expect": {
      "type": "commit",
      "branch": "main"
    }
  }
}
```

### Anthropic Integration

Wrapper for Claude Messages API:

```javascript
// Outbound → Anthropic
{
  model: "claude-3-opus-20240229",
  messages: [
    { role: "system", content: VANT_SYSTEM_PROMPT },
    { role: "user", chain: [...] }
  ],
  tools: [...],
  max_tokens: 4096
}

// Inbound ← Anthropic
{
  id: "msg_...",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "..." }],
  stop_reason: "end_turn"
}
```

---

## Extension Guide

### Adding New Protocols

1. Create section in this document
2. Define:
   - Surface (HTTP/WebSocket/Internal)
   - Request/response format
   - Message types table
   - Implementation examples
3. Add to Table of Contents

### Protocol Naming

- Capitalize: "Agent Chain Protocol" (singular, descriptive)
- Prefix: `<Proto>Protocol` in code (`const AgentChainProtocol = ...`)
- File: docs/RPC.md section headers

### Versioning

Each protocol has independent version:
- `// Version: 1.0.0`
- Increment on breaking changes
- Document migration path

### Validation

Each protocol SHOULD have:
- JSON Schema (separate .schema.json file optional)
- Test fixtures in test/fixtures/

---

## History

| Date | Protocol | Status |
|------|---------|--------|
| 2026-05 | MCP Theme | ✅ Implemented |
| 2026-05 | Agent Chain | 📋 Draft |
| 2026-05 | Skill Chain | 📋 Draft |

---

*Last updated: 2026-05-24*