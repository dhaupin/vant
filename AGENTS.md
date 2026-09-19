# Vant Agent System

> **Multi-Agent Crew Runtime** — Spawn, delegate, workflow, communicate. Up to 4 concurrent agents with full security isolation.

---

## Overview

Vant's agent system implements a **crew model** where a primary agent can spawn up to 3 worker agents (4 total). Each agent runs in isolated `AgentContext` with its own capability scope, RLS policies, and audit trail.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **AgentContext** | Per-agent isolation: own brain, capabilities, RLS, escrow budget |
| **Crew** | Primary + up to 3 workers, hierarchical delegation |
| **Modes** | `PUBLIC` (collaborative) / `PRIVATE` (isolated) |
| **Escalation** | `spawn` and `write` require sudo with service whitelist |

---

## Quick Reference

| Operation | Function | Security |
|-----------|----------|----------|
| Spawn agent | `agents.spawn(name, config)` | `sudo:spawn` (agents service) |
| Delegate sync | `agents.delegate(task, options)` | RLS + capabilities + escrow |
| Delegate async | `agents.delegateAsync(task, options)` | Full security chain + pipeline |
| Poll work | `agents.pollWork(agentId, options)` | Full security chain + pipeline |
| Approve | `agents.approve(agentId, decision)` | Workflow scope |
| Communicate | `agents.join(channel)`, `emit`, `on` | Channel-based pub/sub |
| Metrics | `agents.getMetrics(agentId)` | Read scope |

---

## API Reference

### Lifecycle (`lib/agent-lifecycle.js`)

```javascript
// Spawn a new agent
const agent = await agents.spawn('researcher', {
    role: 'analyst',
    capabilities: ['read', 'write'],
    budget: 100,
    mode: 'PRIVATE'
});

// Kill/terminate
await agents.terminate(agentId);

// Pause/resume
await agents.pause(agentId);
await agents.resume(agentId);

// Fork (clone with same context)
const clone = await agents.fork(agentId, { name: 'researcher-clone' });

// Prune idle agents
await agents.prune({ maxIdle: 3600000 });
```

### Delegation (`lib/agent-delegation.js`)

```javascript
// Synchronous delegation (blocks until complete)
const result = await agents.delegate(agentId, 'Analyze codebase', {
    priority: 'high',
    timeout: 60000
});

// Asynchronous delegation (returns immediately, poll for result)
const taskId = await agents.delegateAsync(agentId, 'Long analysis', {
    priority: 'normal',
    callback: (result) => { console.log('Done:', result); }
});

// Poll for work (worker side)
const work = await agents.pollWork(agentId, { timeout: 30000 });

// Complete work (worker side)
await agents.completeWork(agentId, taskId, { output: 'Analysis complete' });
```

### Workflows (`lib/agent-workflow.js`)

```javascript
// Approve/reject work
await agents.approve(agentId, taskId, { feedback: 'Approved' });
await agents.reject(agentId, taskId, { reason: 'Incomplete' });

// Sign-off (final approval)
await agents.signOff(agentId, taskId);

// Deadlines
await agents.setDeadline(agentId, taskId, Date.now() + 3600000);

// Retry failed work
await agents.retry(agentId, taskId);

// Escalate to human/primary
await agents.escalate(agentId, taskId, { reason: 'Blocked' });
```

### Communication (`lib/agent-communication.js`)

```javascript
// Join a channel
await agents.join(agentId, 'crew-updates');

// Emit to channel
await agents.emit('crew-updates', { from: agentId, message: 'Status update' });

// Listen on channel
agents.on('crew-updates', (data) => {
    console.log('Update:', data.message);
});
```

### Metrics (`lib/agent-metrics.js`)

```javascript
// Get metrics for agent
const metrics = agents.getMetrics(agentId);
// { tasksCompleted, tasksFailed, avgLatency, cpuTime, memory }

// List all agents
const list = agents.list();
// [{ id, name, role, status, created, metrics }]

// Get single agent
const agent = agents.get(agentId);

// Summary across crew
const summary = agents.getSummary();
// { totalAgents, active, completed, failed, totalTasks }
```

---

## Security Model

### AgentContext Isolation

Each agent gets isolated context at spawn:

```javascript
// In agent-internal.js - createAgentContext()
const context = {
    id: agentId,
    brain: brain.createIsolated(),      // Own brain instance
    capabilities: new Set(config.capabilities || []),  // Scoped caps
    rls: { /* per-agent RLS policies */ },
    escrow: { budget: config.budget || 100 },
    audit: { /* dedicated audit trail */ },
    mode: config.mode || 'PRIVATE'
};
```

### Sudo Escalation

| Operation | Required Scope | Service | Auto-Approve |
|-----------|---------------|---------|--------------|
| `spawn` | `spawn` | `agents` | No (requires callback) |
| `write` (brain/files) | `write` | `agents` | No (requires callback) |
| `read` | `read` | — | Yes (default) |

```javascript
// Internal: agents spawn with sudo escalation
const taskId = `agent-${agentId}-${Date.now()}`;
await sudo.escalate(taskId, 'spawn', { 
    service: 'agents', 
    autoGrant: false,  // Requires callback
    reason: `Spawn agent ${name}`
});
```

### RLS (Row-Level Security)

Per-agent resource access:

```javascript
// Check read access
_checkRead(userCtx, `agent:${agentId}:brain:identity`);

// Check write access
_checkWrite(userCtx, `agent:${agentId}:storage:working`);
```

### Capability Gates

Agents use `sandbox.can()` for all operations:

```javascript
const sb = sandbox.create({ 
    canRead: true, 
    canWrite: capabilities.includes('write') 
});

// Or rely on sudo escalation at runtime
if (!sandbox.can('canWrite')) {
    await sudo.escalate(taskId, 'write', { service: 'agents' });
}
```

---

## MCP Integration

External agents connect via MCP JSON-RPC:

| Tool | Description |
|------|-------------|
| `brain_agent_spawn` | Spawn agent with config |
| `brain_agent_list` | List all agents |
| `brain_agent_kill` | Terminate agent |
| `brain_agent_delegate` | Delegate task to agent |
| `brain_agent_poll` | Poll for work |
| `brain_agent_metrics` | Get agent metrics |

```json
{
  "method": "brain_agent_spawn",
  "params": {
    "name": "researcher",
    "role": "analyst",
    "capabilities": ["read", "write"],
    "budget": 100
  }
}
```

---

## Configuration

### agents.ini / config.ini

```ini
[agents]
# Crew limits
max_agents = 4
default_budget = 100
default_mode = PRIVATE

# Timeouts
delegate_timeout = 60000
poll_timeout = 30000
idle_prune_ms = 3600000

# Security
require_spawn_approval = true
require_write_approval = true
isolate_brains = true

# MCP
mcp_enabled = true
mcp_port = 3001
```

### Per-Brain Override

```javascript
// Each brain can have its own agent config
agents.setBrainAgentsConfig('my-brain', {
    maxAgents: 2,
    defaultBudget: 50,
    mode: 'PUBLIC'
});
```

---

## Examples

### Spawn Research Crew

```javascript
// Primary agent spawns 3 workers
const primary = await agents.spawn('primary', { role: 'lead', budget: 200 });

const researcher = await agents.spawn('researcher', { 
    role: 'analyst', 
    capabilities: ['read', 'write'], 
    budget: 100 
});

const coder = await agents.spawn('coder', { 
    role: 'engineer', 
    capabilities: ['read', 'write', 'exec'], 
    budget: 150 
});

const reviewer = await agents.spawn('reviewer', { 
    role: 'auditor', 
    capabilities: ['read'], 
    budget: 50 
});

// Delegate async work
await agents.delegateAsync(researcher.id, 'Analyze security audit');
await agents.delegateAsync(coder.id, 'Implement fixes');
await agents.delegateAsync(reviewer.id, 'Review changes');
```

### Agent Communication

```javascript
// All agents join crew channel
await agents.join(primary.id, 'crew');
await agents.join(researcher.id, 'crew');
await agents.join(coder.id, 'crew');
await agents.join(reviewer.id, 'crew');

// Broadcast updates
await agents.emit('crew', { from: researcher.id, status: 'Found 3 vulnerabilities' });
await agents.emit('crew', { from: coder.id, status: 'Fixed 2, 1 needs review' });
await agents.emit('crew', { from: reviewer.id, status: 'Approved fixes' });
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [labs/prd-agents.md](labs/prd-agents.md) | Full architecture PRD |
| [labs/prd-brain.md](labs/prd-brain.md) | Brain isolation, sync, islands |
| [labs/prd-security.md](labs/prd-security.md) | Sudo, sandbox, RLS, VAF |
| [labs/prd-storage.md](labs/prd-storage.md) | Agent working storage |
| [labs/prd-sudo.md](labs/prd-sudo.md) | Escalation whitelists |
| [/docs/essential/multi-agent.md](docs/essential/multi-agent.md) | Tutorial |
| [/docs/reference/api.md](docs/reference/api.md) | API reference |

---

*Generated from [labs/prd-agents.md](labs/prd-agents.md) — Source of Truth*