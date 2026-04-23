---
permalink: /tutorials/multi-agent.html
layout: default
title: Multi-Agent System
---

# Tutorial: Multi-Agent Coordination

> Build a team of AI agents that work together without conflicts

## The Problem

When multiple agents access the same brain:
- Agent A writes to `lessons.md`
- Agent B writes to `lessons.md` at the same time
- One overwrites the other!

## The Solution: Branch + Lock

Vant uses **Git branches** for isolation + **file locks** for coordination.

```
main branch (production)
    │
    ├── agent-1/          # Agent 1's brain
    ├── agent-2/          # Agent 2's brain  
    └── experiment-alpha/   # Experimental branch
```

## Setup

```bash
# Each agent gets own branch
vant checkout agent-1
vant checkout agent-2
```

## Agent Code

```javascript
const branch = require('./lib/branch');
const lock = require('./lib/lock');

const AGENT_ID = 'agent-1';

async function work() {
  // 1. Acquire lock
  const token = await lock.acquire(AGENT_ID);
  if (!token) {
    console.log('Brain locked, retrying...');
    return;
  }

  // 2. Switch to your branch
  await branch.checkout(AGENT_ID);

  // 3. Do work on your brain...
  const lessons = await readFile('models/public/lessons.md');
  lessons += `\n- Agent ${AGENT_ID}: learned something`;
  await writeFile('models/public/lessons.md', lessons);

  // 4. Commit changes
  await branch.commit(AGENT_ID, 'Updated lessons');

  // 5. Release lock
  await lock.release(AGENT_ID, token);
}
```

## Workflow

```text
┌─────────────────┐
│  Agent A wants   │
│     to work     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Acquire Lock   │◄────────┐
└────────┬────────┘         │
         │                │
    ┌────┴────┐         │
    │         │         │
    ▼ SUCCESS │ FAILED  │       
    │         │         │
    ▼         ▼         │
┌─────────┴─────────┐  │
│ Checkout branch   │  │
│ Do work          │  │
│ Commit          │  │
│ Release lock   │──┘
└─────────────────┘
```

## Multi-Agent Patterns

### Pattern 1: Solo Agent (Safe)
```javascript
// Just commit to main directly
await branch.checkout('main');
await branch.commit('agent-1', 'Updated memory');
```

### Pattern 2: Branch Isolation
```javascript
// Each agent uses own branch
await branch.checkout('agent-1');
// ... work ...
await branch.commit('agent-1', 'Work complete');
```

### Pattern 3: Merge via PR
```javascript
// When done, merge to main via PR
// Don't auto-merge - human reviews first
// Prevents bad writes to main
```

## Best Practices

1. **Always acquire lock** - Even single-agent prevents race conditions
2. **Branch per agent** - `agent-1`, `agent-2`, etc.
3. **Commit frequently** - Small commits easier to review
4. **Merge via PR** - Don't auto-merge to main

## Related

- [Multi-Agent Guide](/vant/guides/multi-agent.html) - Full guide
- [Lock API](/vant/reference/api.html) - Lock module
- [Branch API](/vant/reference/api.html) - Branch module