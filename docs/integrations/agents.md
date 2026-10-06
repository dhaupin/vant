---
version: 0.8.6
permalink: /integrations/agents
layout: default
title: Agents
nav_order: 88
description: Programmatic agent creation and management - spawn, list, inspect, pause, prune, and terminate agents from the library API.
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
const agents = require('vant').agents;
```

## Spawn Agent

Spawn a new agent (the crew limit applies, default 4: you plus three coworkers):

```javascript
const agent = agents.spawn({
    name: 'Agent1',
    role: 'Assistant'
});

console.log(agent.id);   // "agent_abc123"
console.log(agent.name); // "Agent1"
```

`spawn` returns the agent record synchronously. Roster persistence is
asynchronous - call `await agents.flush()` before your process exits so a
fresh process sees the new agent.

## List Agents

```javascript
const list = await agents.list();
console.log(list);
// [{ id: "agent_1", name: "Agent1", state: "idle" }]
```

## Get Agent

Get an agent by ID:

```javascript
const agent = agents.get('agent_abc123');
```

## Pause and Resume

```javascript
agents.pause('agent_abc123');
agents.resume('agent_abc123');
```

## Prune Stale Agents

Drop idle agents older than the max age:

```javascript
await agents.prune();
```

## Terminate Agent

Remove an agent from the roster (persisted; a fresh process sees it gone):

```javascript
await agents.terminate('agent_abc123');
// agents.kill is an alias for terminate
```

---

## State

Agent states:

| State | What |
|-------|------|
| idle | Spawned, waiting for work |
| paused | Paused via `pause()` |
| (removed) | After `terminate()` / `kill()` the agent is deleted from the roster |

---

## Related

- [Runtime](/vant/runtime/runtime) - Runtime API
- [Multi-Agent](/vant/multi-agent/agents) - Multi-agent workflows
- [Locks](/vant/operations/locks) - Lock system and coordination

## Next

- [GitHub Integration](/vant/integrations/github) - GitHub workflows
