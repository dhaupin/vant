---
version: 0.8.6
permalink: /reference/node-registry
layout: default
title: Node Registry API
nav_order: 85
---

# Node Registry API

Peer discovery system for distributed Vant nodes.

## Functions

| Function | What |
|----------|------|
| `register(node)` | Register peer |
| `discover(filter)` | Find peers |
| `heartbeat(id)` | Keepalive |
| `unregister(id)` | Remove peer |
| `get(id)` | Get peer info |
| `list()` | All peers |
| `getStats()` | Network stats |

## Usage

```javascript
const registry = require('vant/lib/node-registry');

// Register self
await registry.register({ id: 'agent-1', capabilities: ['memory'] });

// Discover
const peers = await registry.discover({ capability: 'storage' });

// Heartbeat
await registry.heartbeat('agent-1');

// List all
const all = await registry.list();
```