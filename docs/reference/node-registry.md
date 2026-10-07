---
version: 0.8.6
permalink: /reference/node-registry
layout: default
title: Node Registry API
nav_order: 127
---

# Node Registry API

Peer discovery system for distributed Vant nodes.

## Functions

| Function | What |
|----------|------|
| `register(node)` | Register peer (`{id, name, host, port}` - id = principal, name = node) |
| `discover(filter)` | Find peers |
| `heartbeat(nodeId)` | Keepalive |
| `refresh(nodeId)` | Refresh peer record |
| `unregister(id)` | Remove peer |
| `get(id)` | Get peer info |
| `list()` | All peers |
| `resolvePrincipal(id)` | Transport-id to principal mapping |
| `getStats()` | Registry stats |

Registration enforces a quarantine gate: a quarantined agent registers
but their vote does not count (the consensus vetting anchor reads from
here).

## Usage

```javascript
const registry = require('vant/lib/node-registry');

// Register a peer (sync; ids become vetting anchors)
registry.register({ id: 'acme-1', name: 'acme-node', host: '192.0.2.10', port: 4891 });

// Discover
const peers = registry.discover({ capability: 'storage' });

// Heartbeat
registry.heartbeat('acme-1');

// List all
const all = registry.list();
```