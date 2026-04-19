# AGENTS.md - Agent Guide to Vant Brain Branching

This guide explains how agents can use Vant's branching system for safe multi-agent memory.

---

## The Problem

Multiple agents working on the same brain can cause conflicts:
- Agent A writes to `lessons.md`
- Agent B writes to `lessons.md` at the same time
- One overwrite the other

## The Solution: Branch + Lock

Vant uses **Git branches** for isolation and **file locks** for coordination.

```
main branch (reserved for production)
    │
    ├── agent-1/          # Agent 1's working brain
    ├── agent-2/          # Agent 2's working brain  
    ├── experiment-alpha/    # Experimental branch
    └── feature-memory/     # Feature work
```

---

## Quick Start

```javascript
// In your agent code:
const branch = require('./lib/branch');
const lock = require('./lib/lock');

// 1. Acquire lock (prevents others from jumping in)
const token = await lock.acquire('my-agent-id');
if (!token) {
    // Another agent has the lock - wait or skip
    console.log('Brain locked, retrying...');
    return;
}

// 2. Create/switch to your branch
await branch.checkout('agent-my-id');

// 3. Do work on your brain...
// Write to models/public/goals.md
// Write to models/public/lessons.md

// 4. Commit your changes
await branch.commit('my-agent-id', 'Updated memory');

// 5. Release lock
await lock.release('my-agent-id', token);
```

---

## API Reference

### lib/branch.js

```javascript
const branch = require('./lib/branch');

// Get current branch name
branch.currentBranch()  // Returns: "main" or "agent-1"

// List all branches
branch.listBranches()   // Returns: ["main", "agent-1", "agent-2"]

// Create new branch
branch.create('agent-1')    // Creates from current branch

// Switch to branch
branch.checkout('agent-1')    // Switches working branch

// Commit changes
branch.commit('agent-1', 'Updated lessons learned')

// Merge branch to main (optional)
branch.merge('agent-1')      // Merges to main
```

### lib/lock.js

```javascript
const lock = require('./lib/lock');

// Acquire lock
const token = await lock.acquire('agent-1');
// Returns: "abc123..." or null if already locked

// Check if locked
lock.isLocked()    // Returns: true/false

// Get lock info
lock.getLock()    // Returns: { agent, timestamp, token }

// Release lock (requires valid token)
await lock.release('agent-1', token);

// Release even if token invalid (force)
await lock.release('agent-1', null, true);
```

---

## Agent Workflows

### Workflow 1: Solo Agent

```javascript
// Just commit directly to main (okay for one agent)
const branch = require('./lib/branch');

await branch.checkout('main');
// do work...
await branch.commit('agent-1', 'Updated memory');
```

### Workflow 2: Multi-Agent (Safe)

```javascript
// Each agent uses their own branch
const branch = require('./lib/branch');
const lock = require('./lib/lock');

const agentId = process.env.VANT_AGENT_ID || 'agent-default';

// 1. Try to acquire lock
const token = await lock.acquire(agentId);
if (!token) {
    console.log('Locked, waiting...');
    await new Promise(r => setTimeout(r, 5000));
    return; // Or retry
}

// 2. Use own branch
await branch.checkout(agentId);

// 3. Do work
// ...modify memory files...

// 4. Commit
await branch.commit(agentId, 'Work complete');

// 5. Release lock
await lock.release(agentId, token);
```

### Workflow 3: Merge (Pull Request)

```javascript
// When agent is done, merge to main via PR
const branch = require('./lib/branch');

await branch.checkout('experiment-feature');
// ...do work...
await branch.commit('agent-1', 'Feature complete');

// Merge not automatic - human reviews first
// Use GitHub PR for the merge
// This prevents bad writes to main
```

---

## CLI Commands

```bash
# List branches
git branch -a

# Create branch
git checkout -b agent-1

# Switch branch  
git checkout agent-1

# Commit changes
git add -A
git commit -m "Agent 1: Updated lessons"
git push origin agent-1

# Merge branch to main (via PR)
# Do NOT merge directly in code - use PR for review
```

---

## Best Practices

1. **Always use locks** - Even on single-agent systems, locks prevent race conditions
2. **Use agent-specific branches** - Branch per agent: `agent-1`, `agent-2`, etc.
3. **Commit frequently** - Small commits are easier to review
4. **Merge via PR** - Don't auto-merge to main; use GitHub PR for review
5. **Cleanup old branches** - Delete branches after merged
6. **Timeout locks** - Lock module has 1-hour default timeout
7. **Never write to main directly** - Keep main as "known good"

---

## Troubleshooting

### "Lock is held by another agent"

```bash
# Check who holds the lock
cat .agent-locks/current.lock
# or
node bin/lock.js status
```

### "Merge conflict"

```bash
# Pull latest main, resolve conflict
git checkout main
git pull origin main
git checkout agent-1
git merge main
# Resolve conflicts in editor
git add -A
git commit -m "Resolve merge conflicts"
```

### Branch not found

```bash
# Create it
git checkout -b agent-1
# or use API
branch.create('agent-1')
```

---

## Security

- Lock files stored in `.agent-locks/` (gitignored)
- Lock token validates ownership on release
- Branch names are agent IDs, not user input
- Commits include agent ID in message

---

## Related Docs

- `lib/branch.js` - Branch API source
- `lib/lock.js` - Lock API source
- `models/public/schema/memory-files.md` - Memory file schema
- `CHANGELOG.md` - Version history