---
version: 0.8.11
permalink: /guides/agents
layout: default
title: Agents
nav_order: 98
2
---

# Agents

Agent creation and management.

## What

Manage multiple agents:

- Create agents
- List agents
- Agent state
- Cleanup

## Quick Start

Import agents:

```javascript
const agents = require('./lib/agents');
```

## Create Agent

Create a new agent:

```javascript
const agent = await agents.create({
    name: 'Agent1',
    role: 'Assistant',
    brain: 'brain-repo'
});

console.log(agent.id);   // "agent_abc123"
console.log(agent.name); // "Agent1"
```

## List Agents

```javascript
const list = await agents.list();
console.log(list);
// [{ id: "agent_1", name: "Agent1", state: "active" }]
```

## Get Agent

Get agent by ID:

```javascript
const agent = await agents.get('agent_abc123');
```

## Update Agent

Update agent state:

```javascript
await agents.update('agent_abc123', { state: 'idle' });
```

## Delete Agent

```javascript
await agents.delete('agent_abc123');
```

---

## State

Agent states:

| State | What |
|-------|------|
| pending | Just created |
| active | Currently running |
| idle | Waiting |
| stopped | Completed |

---

## See Also

- [Runtime](runtime) - Runtime API
- [Multi-Agent](multi-agent) - Multi-agent workflows
- [Lock](multi-agent) - Coordination