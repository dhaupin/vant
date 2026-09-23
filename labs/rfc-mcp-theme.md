# Vant MCP Theme Standard RFC

## Overview
Standard way to provide presentation hints in MCP JSON-RPC responses.

## Status: IMPLEMENTED ✓
Implemented in Vant v0.8.6 - lib/theme.js + lib/mcp.js

## Motivation
MCP protocol is pure data (JSON). Clients rendering responses often lack context on how to display: success/fail, what icon to show, formatting expectations.

## Specification

### Response Structure
```javascript
{
  result: { ...data },        // Required: actual response data
  _theme?: {                 // Optional: presentation hints
    status?: "success" | "error" | "warning" | "loading" | "info",
    icon?: string,           // Unicode emoji or named icon
    format?: "text" | "markdown" | "html",
    color?: string,           // Hex color (e.g., "#22C55E")
    priority?: number        // 1-5, sort order for lists
  }
}
```

### Status Values
| Status | Display | Color |
|--------|--------|-------|
| success | ✓ Icon | green |
| error | ✗ Icon | red |
| warning | ⚠ Icon | yellow |
| loading | ◌ Icon | blue |
| info | ℹ Icon | dim |

### Examples

**Success Response**
```javascript
// Before (current)
{ name: "learnings", status: "written" }

// After
{ 
  result: { name: "learnings", status: "written" },
  _theme: { status: "success", icon: "✓", format: "text" }
}
```

**Error Response**
```javascript
// Before
{ error: "Failed to write brain", code: "WRITE_ERR" }

// After
{ 
  error: "Failed to write brain", 
  code: "WRITE_ERR",
  _theme: { status: "error", icon: "✗", color: "#EF4444" }
}
```

**Rich Content**
```javascript
{
  result: { content: "## Summary\n\n**Key learnings:**..." },
  _theme: { status: "success", format: "markdown" }
}
```

## Implementation

### Helper Function (lib/theme.js)
```javascript
// Apply theme to MCP response
applyToMCP(result, options = {}) {
  return {
    ...result,
    _theme: {
      status: options.status || 'info',
      icon: options.icon || STATUS_ICONS[options.status] || 'ℹ',
      format: options.format || 'text',
      color: options.color || STATUS_COLORS[options.status]
    }
  };
}
```

### Usage in lib/mcp.js
```javascript
const theme = require('./theme');

// Wrap handler responses
async function wrapper(handler, params) {
  try {
    const result = await handler(params);
    return theme.applyToMCP(result, { status: 'success' });
  } catch (e) {
    return { error: e.message, _theme: { status: 'error', icon: '✗' } };
  }
}
```

## Clients
Clients MAY interpret `_theme`:
- Terminal UIs: render colored text + icons
- Web UIs: apply CSS styling
- Voice: ignore or speak status

Clients MUST ignore unknown `_theme` fields (forward compatibility).

## Backward Compatibility
`_theme` is OPTIONAL - all existing responses remain valid.