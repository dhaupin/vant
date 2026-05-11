---
version: 0.8.11
permalink: /framework.md/framework
layout: default
title: Framework
nav_order: 63
---

# Framework

Vant's internal framework.

## What

The framework module provides:

- Unified API wrapper
- Mode detection
- Hooks system
- Execution chain

## Quick Start

Import framework:

```javascript
const framework = require('./lib/framework');
```

## Modes

Framework detects running mode:

```javascript
const mode = framework.getMode();
console.log(mode); // "cli" | "mcp" | "server"
```

### Set Mode

```javascript
framework.setMode('mcp');
```

## Hooks

Add execution hooks:

```javascript
framework.onBeforeExecute((ctx) => {
    console.log('Before:', ctx.operation);
});

framework.onAfterExecute((ctx) => {
    console.log('After:', ctx.result);
});
```

## Execute

Run through framework:

```javascript
const result = await framework.execute('read', () => {
    return brain.get('learnings', 'lesson');
});
```

## Middleware

Add middleware:

```javascript
framework.use('read', async (ctx, next) => {
    // Pre-processing
    const result = await next();
    // Post-processing
    return result;
});
```

---

## API

Framework provides unified API:

```javascript
const api = require('./lib/api');

// Same interface for CLI, MCP, server
const result = await api.execute('read', () => brain.get('key'));
```

See [API](runtime) for programmatic API.

---

## See Also

- [Runtime](runtime) - Runtime API
- [Server](server) - HTTP server
- [MCP](mcp) - MCP server