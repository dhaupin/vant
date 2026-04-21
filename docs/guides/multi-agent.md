---
permalink: /multi-agent.html
---


---
version: 0.8.4
title: Multi-Agent
slug: /multi-agent
order: 9
---

# Multi-Agent

## Branch + Lock

Vant uses branches for agent isolation and locks for coordination.

### Workflow

1. **Acquire lock** - Prevent conflicts
2. **Create/switch branch** - Work in isolation
3. **Do work** - Modify brain files
4. **Commit changes** - Save to branch
5. **Release lock** - Allow others

### Branch Per Agent

```bash
git checkout -b agent-1
# work...
git add -A
git commit -m "Agent 1: Updated memory"
```

### Lock API

```javascript
const lock = await lock.acquire(agentId);
if (!lock) {
    console.log('Brain locked');
    return;
}
// work...
await lock.release(agentId, token);
```

## Merging

Merge via PR for review:
```bash
# Create PR on GitHub
# Human reviews
# Merge to main
```

## Best Practices

1. Use locks - Even solo agents prevent race conditions
2. Branch per agent - `agent-1`, `agent-2`
3. Commit small - Easy to review
4. Merge via PR - Human review first
5. Set timeouts - Lock expires after 1 hour

See also: [Architecture](./architecture.md), [Schema](../reference/schema.md)
