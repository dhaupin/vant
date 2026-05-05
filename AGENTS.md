# AGENTS.md - Agent Guide to Vant

Guide for AI agents using Vant's branching system for safe multi-agent memory.

---

## Quick Start

```javascript
const branch = require('./lib/branch');
const lock = require('./lib/lock');

// 1. Acquire lock
const token = await lock.acquire('my-agent-id');
if (!token) return; // Another agent has lock

// 2. Use your branch
await branch.checkout('agent-my-id');

// 3. Do work (write to models/public/*.md)

// 4. Commit
await branch.commit('agent-my-id', 'Updated memory');

// 5. Release lock
await lock.release('agent-my-id', token);
```

---

## Why Branch + Lock?

Multiple agents writing to the same brain causes conflicts:

- Agent A writes to `lessons.md`
- Agent B writes to `lessons.md` at the same time
- One overwrites the other

**Solution:** Git branches for isolation + file locks for coordination.

[Deep Dive →](https://docs.creadev.org/vant/guides/multi-agent.html)

---

## Branch API

```javascript
const branch = require('./lib/branch');

// List branches
branch.listBranches()   // ["main", "agent-1", "agent-2"]

// Switch branch
await branch.checkout('agent-1')

// Commit changes
await branch.commit('agent-1', 'Agent 1: Updated lessons')
```

---

## Lock API

```javascript
const lock = require('./lib/lock');

// Acquire lock (returns token or null)
const token = await lock.acquire('agent-1');

// Check if locked
lock.isLocked()

// Release lock
await lock.release('agent-1', token);
```

---

## Workflows

### Solo Agent
Work directly on `main` branch. Locks optional but recommended.

### Multi-Agent (Safe)
1. Acquire lock
2. Create/switch to your branch (`agent-1`, `agent-2`, etc.)
3. Do work
4. Commit
5. Release lock

[Full Workflow Guide →](https://docs.creadev.org/vant/guides/multi-agent.html)

---

## Brain Files

Write to `models/public/`:

| File | Purpose |
|------|---------|
| `identity.md` | Core identity |
| `goals.md` | Objectives |
| `lessons.md` | Learnings |
| `preferences.md` | Preferences |
| `errors.md` | Mistakes to avoid |

[Brain Schema →](https://docs.creadev.org/vant/guides/brain.html)

---

## VAF Security

All inputs validated through VAF:

```javascript
const vaf = require('./lib/vaf');

vaf.check(input, {type: 'string', maxLength: 50000});
vaf.check(filepath, {type: 'path'});
```

Blocked:
- Path traversal: `../etc/passwd`
- Script injection: `<script>`, `javascript:`
- Shell commands: `rm -rf`, `|bash`

[Security Guide →](https://docs.creadev.org/vant/guides/security.html)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Lock held" | Wait or skip |
| Merge conflict | `git merge main` then resolve |
| Branch not found | `git checkout -b agent-1` |

---

## Related

- [Multi-Agent Guide](https://docs.creadev.org/vant/guides/multi-agent.html)
- [Brain Files](https://docs.creadev.org/vant/guides/brain.html)
- [Security](https://docs.creadev.org/vant/guides/security.html)
- [Release Process](https://docs.creadev.org/vant/guides/release.html)
- [MCP Server](https://docs.creadev.org/vant/guides/mcp.html)
