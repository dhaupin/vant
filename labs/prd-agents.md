# Vant Agent System — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-19  
**Status:** Implemented (v0.8.7+)

---

## 1. Overview

The Vant Agent System provides a **multi-agent crew** architecture supporting up to 4 concurrent agents (you + 3 coworkers). Agents can be spawned, delegated work, communicate via channels, and participate in approval workflows — all with per-agent isolation, capability-based security, and MCP integration for external agents.

### Design Principles

- **Multi-Agent Crew**: Up to 4 agents per session (1 orchestrator + 3 workers)
- **Per-Agent Isolation**: Each agent gets its own `AgentContext` with separate state, events, conversations, and sandbox
- **Capability-Based Security**: Per-agent sandbox capabilities mapped to sudo scopes (`spawn`, `write`, `execute`, `read`)
- **Delegation Pipeline**: Sync (`delegate`) and async (`delegateAsync`, `pollWork`, `completeWork`) patterns
- **Workflow Engine**: Approve/reject/sign-off, deadlines, retries, escalation with human-in-the-loop
- **Channel Communication**: Per-agent + global events via `join`/`emit`/`on` (backward compatible)
- **MCP Integration**: External agents connect via JSON-RPC (`brain_agent_spawn`, `brain_agent_list`, `brain_agent_kill`)
- **Metrics & Observability**: Per-agent and aggregate metrics (completion rates, lifespan, states)

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | Autonomous worker with isolated context, sandbox, and metrics |
| **AgentContext** | Per-agent state container: work items, events, conversations, sandbox |
| **Delegation** | Assign task to agent (sync or async via stream queue) |
| **Workflow** | Approval chain: approve/reject/sign-off/deadline/retry/escalate |
| **Channel** | Pub/sub per-agent or global (conversations + events) |
| **MCP Agent** | External agent connecting via JSON-RPC over MCP |
| **Team** | Logical group with role-based permissions (`teams.js`) |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  vant agents │ vant agent │ MCP clients │ External JSON-RPC     │
└─────────────────────┬───────────────────────────────────────────┘
                      │ agents.spawn / delegate / workflow / comms
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENTS LAYER (lib/agents.js)               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Agent (class)   │  │ Prototypes      │  │ Brain Config    │  │
│  │ spawn/list      │  │ loadProto/list  │  │ per-brain caps  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Re-exports from 6 modules
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              AGENT MODULES (6 specialized files)                │
│  ┌────────────┐ ┌───────────┐ ┌───────────┐ ┌────────────────┐ │
│  │ lifecycle  │ │ delegation│ │ workflow  │ │ communication  │ │
│  │ spawn/kill │ │ delegate  │ │ approve   │ │ join/emit/on   │ │
│  │ pause/resume│ │ delegateA.│ │ reject    │ │ channels       │ │
│  │ fork/prune │ │ pollWork  │ │ signOff   │ │ backward compat│ │
│  └────────────┘ └───────────┘ └───────────┘ └────────────────┘ │
│  ┌────────────┐ ┌───────────┐                                     │
│  │ metrics    │ │ internal  │                                     │
│  │ getMetrics │ │ AgentCtx  │                                     │
│  │ list/get   │ │ security  │                                     │
│  └────────────┘ └───────────┘                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Security Chain: Sandbox → VAF → QoS → Escrow
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Sandbox │ │ VAF     │ │ QoS     │ │ Escrow  │ │ RLS      │  │
│  │ caps    │ │ input   │ │ rate    │ │ write   │ │ per-row  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Stream  │ │ Pipeline│ │ Trust   │ │ Teams   │ │ Brain    │  │
│  │ queue   │ │ middleware│ │ scores  │ │ RBAC    │ │ attention│  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| File | Responsibility |
|------|----------------|
| `lib/agents.js` | Main entry point, re-exports all modules, `Agents` class, prototype loading |
| `lib/agent-internal.js` | `AgentContext` class, global registry, security chain, config, persistence |
| `lib/agent-lifecycle.js` | Spawn, kill, pause, resume, fork, prune |
| `lib/agent-delegation.js` | Delegate (sync), delegateAsync, pollWork, completeWork |
| `lib/agent-workflow.js` | Approve, reject, signOff, setDeadline, retry, escalate, setPriority |
| `lib/agent-communication.js` | Join, emit, on (per-agent + global fallback) |
| `lib/agent-metrics.js` | getMetrics, list, get, getSummary |
| `bin/agents.js` | CLI: list, spawn, kill, status, info |
| `bin/agent-spawner.js` | Extended CLI with MCP, delegate, fork, tools, emit |

---

## 3. Agent Lifecycle

Agents progress through states: `idle` → `working` → `idle` (or `paused`/`approved`/`rejected`)

### `spawn(options)`

Creates a new agent with isolated context, registers in global registry, persists to `.agent_tmp/agents.json`.

```javascript
const agents = require('./lib/agents');

// Spawn a new agent
const agent = await agents.spawn({
    name: 'Claude',
    role: 'Assistant',
    type: 'default',           // 'default' | 'worker' | 'reviewer'
    brain: 'vant',             // Brain assignment
    team: 'engineering',       // Team assignment (teams.js)
    roleId: 'senior-dev',      // Role within team
    parent: 'agent_abc123',    // Parent agent ID (for forks)
    sandboxCaps: {             // Per-agent capabilities (default shown)
        canRead: true,
        canWrite: true,
        canExecute: true,
        canSpawn: false,
        canDelete: false
    },
    mcp: true,                 // Enable MCP tools for this agent
    taskId: 'current-task'     // For sudo context
});

// Returns: { id: 'agent_abc123', name: 'Claude', role: 'Assistant', brain: 'vant' }
```

**Security Checks:**
1. Quota: `_agentContexts.size < maxAgents` (default 200, configurable)
2. Rate limit: 10 spawns/min per org (configurable `agents.spawnRateLimit`)
3. Sandbox: `canSpawn` capability
4. Sudo: `spawn` scope for taskId

**Events Emitted:** `agent:spawned`, `agent:spawn:rateLimited`

### `kill(agentId)` / `terminate(agentId)`

Removes agent from registry, persists cleanup.

```javascript
await agents.kill('agent_abc123');
// Returns: true/false
```

### `pause(agentId)` / `resume(agentId)`

Suspends/resumes agent work. Updates `pausedAt`/`resumedAt` timestamps.

```javascript
await agents.pause('agent_abc123');
// { paused: true, agentId: 'agent_abc123' }

await agents.resume('agent_abc123');
// { resumed: true, agentId: 'agent_abc123' }
```

### `fork(options)`

Creates child agent inheriting parent's brain, team, roleId.

```javascript
const child = await agents.fork({
    name: 'worker_fork',
    role: 'Worker'
});
// Parent set automatically from runtime.getState().id
```

### `prune(options)`

Removes stale agents (idle > maxAge, default 24h).

```javascript
await agents.prune({ maxAge: 3600000 }); // 1 hour
// { pruned: 3 }
```

---

## 4. Delegation

Two patterns: **synchronous** (direct execution) and **asynchronous** (queue + poll).

### `delegate(agentId, task)`

Synchronous delegation — executes task immediately in agent's context with full security chain.

```javascript
const result = await agents.delegate('agent_abc123', {
    operation: 'brainLoad',      // or 'brainSave', 'execute', 'storageWrite', etc.
    options: { key: 'identity' },
    // OR MCP tool call
    mcp: {
        tool: 'brain_load',
        args: { name: 'identity' }
    }
});

// Returns: { agentId, result: {...} }
```

**Flow:**
1. Recursion guard check (`delegate:<agentId>`)
2. Team permission check (`teams.can(agentId, requiredPerm)`)
3. Sandbox capability: `canExecute`
4. Security chain: `_runAgentSecurityChain` (VAF → QoS → Escrow)
5. Pipeline execution: `pipeline.run({ name: 'agents:execute', task }, handler, { mode })`
6. Trust recording on success

### `delegateAsync(agentId, task)`

Asynchronous delegation — enqueues work to agent's stream queue, returns immediately.

```javascript
const result = await agents.delegateAsync('agent_abc123', {
    operation: 'brainSave',
    options: { name: 'learnings', content: 'New discovery' }
});

// Returns: { agentId, workId: 'work_xyz', status: 'queued' }
```

**Requires:** `canSpawn` capability (for async delegation)

### `pollWork(agentId)`

Agent pulls and executes next work item from its queue.

```javascript
const result = await agents.pollWork('agent_abc123');

// Success:
// { agentId, workId: 'work_xyz', result: {...}, status: 'completed' }

// No work:
// { error: 'No work in queue', code: 'E_NO_WORK' }
```

**Flow:**
1. Recursion guard + team + sandbox (`canRead`)
2. `stream.poll(agentId)` gets next work item
3. Security chain + pipeline execution
4. `stream.complete(workId, result)` or `stream.fail(workId, error)`
5. Metrics update: `workItemsCompleted` / `workItemsFailed`

### `completeWork(workId, result)`

External completion of work item (e.g., from workflow approval).

```javascript
await agents.completeWork('work_xyz', { status: 'approved', output: '...' });
```

---

## 5. Workflows

Approval and escalation workflows for human-in-the-loop operations.

### `approve(workId, feedback)`

Marks work as approved, updates agent state.

```javascript
await agents.approve('work_xyz', { comment: 'Looks good', reviewer: 'human' });
// { approved: true, workId: 'work_xyz', feedback: {...} }
```

### `reject(workId, reason)`

Marks work as rejected with reason, stores feedback in agent context.

```javascript
await agents.reject('work_xyz', 'Requires additional testing');
// { rejected: true, workId: 'work_xyz', reason: 'Requires additional testing' }
```

### `signOff(workId, approved, notes)`

Convenience wrapper: approves if true, rejects if false.

```javascript
await agents.signOff('work_xyz', true, { notes: 'Ship it' });
await agents.signOff('work_xyz', false, { reason: 'Needs refactor' });
```

### `setDeadline(workId, ms, onTimeout)`

Sets deadline with auto-action on timeout.

```javascript
// Fail on timeout (default)
agents.setDeadline('work_xyz', 300000, 'fail'); // 5 min

// Escalate to human on timeout
agents.setDeadline('work_xyz', 300000, 'escalate');
```

### `retry(workId, options)`

Retries failed work with exponential backoff.

```javascript
await agents.retry('work_xyz', { maxRetries: 3, delay: 1000 });
// { retried: true, workId: 'work_xyz', retries: 1, maxRetries: 3 }
```

### `escalate(workId, reason)`

Escalates to human via `msg.send('@human', ...)`.

```javascript
await agents.escalate('work_xyz', 'Blocked on external dependency');
// { escalated: true, workId: 'work_xyz', reason: '...' }
```

### `setPriority(workId, priority)`

Sets work priority (1-10).

```javascript
agents.setPriority('work_xyz', 8);
// { priority: 8, workId: 'work_xyz' }
```

---

## 6. Communication

Per-agent channels with global fallback for backward compatibility.

### `join(agentId, conversationId, options)`

Joins/creates a conversation for an agent. Returns message history and post function.

```javascript
const channel = agents.join('agent_abc123', 'project-alpha');

// channel = { conversationId, messages: [...], post: (content, author) => {} }

channel.post('Starting task', 'agent_abc123');
// Adds to agent's conversation
```

### `joinGlobal(conversationId, options)`

Global conversation (legacy, shared across all agents).

```javascript
const channel = agents.joinGlobal('general');
channel.post('Hello all', 'system');
```

### `emit(agentId, event, data)`

Emits event to agent's listeners + global event bus.

```javascript
agents.emit('agent_abc123', 'task:completed', { workId: 'work_xyz', result: 'success' });
```

### `on(agentId, event, callback)`

Registers event listener for specific agent.

```javascript
agents.on('agent_abc123', 'task:completed', (data) => {
    console.log('Agent finished:', data.workId);
});
```

### Global Variants (Backward Compatible)

```javascript
agents.emitGlobal('brain:changed', { brain: 'vant' });
agents.onGlobal('brain:changed', (data) => { ... });
```

---

## 7. Metrics

Observability for agent fleet.

### `getMetrics()`

Aggregate metrics across all agents.

```javascript
const metrics = agents.getMetrics();
// {
//   total: 3,
//   states: { idle: 2, working: 1 },
//   avgLifespan: 120000,
//   completed: 42,
//   failed: 3
// }
```

### `getSummary()`

Alias for `getMetrics()`.

### `list(userCtx)`

Lists all agents with RLS check.

```javascript
const list = await agents.list(userCtx);
// [
//   { id: 'agent_abc123', name: 'Claude', role: 'Assistant', state: 'idle', mcp: true },
//   ...
// ]
```

### `get(agentId)`

Gets full agent details (plain object, no methods).

```javascript
const agent = agents.get('agent_abc123');
// {
//   id: 'agent_abc123',
//   name: 'Claude',
//   role: 'Assistant',
//   type: 'default',
//   brain: 'vant',
//   state: 'idle',
//   created: 1234567890,
//   parent: null,
//   children: [],
//   team: 'engineering',
//   roleId: 'senior-dev',
//   mcp: true,
//   task: null,
//   feedback: null,
//   pausedAt: null,
//   resumedAt: null,
//   metrics: { workItemsCompleted: 5, workItemsFailed: 0, totalLifespan: 0, lastActive: 1234567890 }
// }
```

---

## 8. Security

### Per-Agent AgentContext Isolation

Each agent gets a **fresh `AgentContext`** with completely isolated:
- `_workItems` Map (stream-based work queue)
- `_events` Map (event listeners)
- `_conversations` Map (chat history)
- `_sandbox` (capability sandbox - child of main if `createChild` exists)
- `metrics` (per-agent counters)

```javascript
// agent-internal.js:85-140
class AgentContext {
    constructor(agentData, parentContext = null) {
        this._workItems = new Map();
        this._events = new Map();
        this._conversations = new Map();
        this._sandbox = null;           // Lazy-loaded
        this._sandboxCaps = agentData.sandboxCaps || {};  // Per-agent caps
        // ... metrics, inherited context
    }
}
```

### RLS (Row-Level Security)

Per-agent RLS checks via agent's sandbox:

```javascript
// agent-internal.js:169-174
checkRead(userCtx, resource, operation) {
    const sb = this._getSandbox();
    if (userCtx && sb && sb.rls) {
        sb.rls.checkRead(userCtx, resource, operation);
    }
}
```

### Capability Checks

Agent capabilities mapped to sandbox:

```javascript
// agent-internal.js:114-122
this._capMap = {
    canRead: 'canRead',
    canWrite: 'canWrite',
    canExecute: 'canExec',
    canSpawn: 'canSpawn',
    canDelete: 'canDelete',
    canNetwork: 'canNetwork',
    canRecurse: 'canRecurse'
};

// agent-internal.js:158-166
can(capability) {
    const sb = this._getSandbox();
    if (sb && typeof sb.can === 'function') {
        const mappedCap = this._capMap[capability] || capability;
        return sb.can(mappedCap);
    }
    return true;
}
```

### Sudo Escalation for Spawn/Write

Operations requiring elevated privileges:

| Operation | Sudo Scope | Service | Auto-Approve |
|-----------|------------|---------|--------------|
| `spawn` | `spawn` | `agents` | ❌ (requires callback) |
| `write` (brain/storage) | `write` | `agents` | ❌ (requires callback) |
| `execute` (MCP tools) | `exec` | `agents` | ❌ |

```javascript
// agent-lifecycle.js:47-49
if (!sudo.can(taskId, 'spawn')) {
    throw new errors.VantError('Sudo: spawn not allowed', { code: errors.CODES.SUDO_DENIED });
}

// agent-internal.js:381-390 (write operations)
if (!sudo.can(taskId, 'write')) {
    const escalated = await sudo.escalate(taskId, 'write', { 
        service: 'agents', 
        reason: 'Agent write operation requires write scope',
        autoGrant: true 
    });
}
```

### Recursion Guards

All delegation operations protected by depth limiting:

```javascript
// agent-delegation.js:22-26
const depthCheck = guard.check('delegate:' + agentId);
if (!depthCheck.allowed) {
    return { error: 'Delegation depth exceeded', code: 'E_DELEGATE_DEPTH', depth: depthCheck.depth, max: depthCheck.max };
}
// ...
guard.release('delegate:' + agentId);
```

---

## 9. MCP Integration

External agents connect via MCP JSON-RPC on port 3100 (default). Exposes 3 agent management tools.

### MCP Server Start

```bash
# Via CLI
vant agent mcp [port]
# Or
node bin/agent-spawner.js mcp [port]

# Via code
const mcp = require('./lib/mcp');
await mcp.start({ port: 3100 });
```

### Available Agent Tools (JSON-RPC)

| Tool | Description | Parameters |
|------|-------------|------------|
| `brain_agent_spawn` | Spawn new agent (max 4) | `name`, `role`, `brain`, `team`, `roleId`, `reportsTo`, `mcp` |
| `brain_agent_list` | List active agents | none |
| `brain_agent_kill` | Kill agent by ID | `id` |

### JSON-RPC Examples

```bash
# Spawn agent
curl -X POST http://localhost:3100/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"brain_agent_spawn","params":{"name":"Claude","role":"Assistant","team":"engineering","mcp":true},"id":1}'

# List agents
curl -X POST http://localhost:3100/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"brain_agent_list","params":{},"id":2}'

# Kill agent
curl -X POST http://localhost:3100/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"brain_agent_kill","params":{"id":"agent_abc123"},"id":3}'
```

### Response Format

```json
// Success
{"jsonrpc":"2.0","result":{"id":"agent_abc123","name":"Claude","role":"Assistant"},"id":1}

// Error
{"jsonrpc":"2.0","error":{"code":-32603,"message":"Agent quota reached"},"id":1}
```

### Additional MCP Agent Tools

| Tool | Description |
|------|-------------|
| `vant_agents_delegate_mcp` | Delegate with MCP tool execution |
| `vant_agents_broadcast` | Broadcast message to all agents |
| `agent_proto_list` | List available agent prototypes |
| `agent_proto_load` | Load agent prototype definition |
| `vant_agents_call_remote` | Call remote Vant MCP server |

---

## 10. API Reference

### Main Entry Point (`lib/agents.js`)

```javascript
const agents = require('./lib/agents');

// Lifecycle
agents.spawn(options)          // → { id, name, role, brain }
agents.kill(agentId)           // → boolean
agents.terminate(agentId)      // → boolean (alias)
agents.pause(agentId)          // → { paused, agentId }
agents.resume(agentId)         // → { resumed, agentId }
agents.fork(options)           // → { id, name, role, brain }
agents.prune(options)          // → { pruned }

// Delegation
agents.delegate(agentId, task)           // → { agentId, result }
agents.delegateAsync(agentId, task)      // → { agentId, workId, status }
agents.pollWork(agentId)                 // → { agentId, workId, result, status }
agents.completeWork(workId, result)      // → workItem

// Workflow
agents.approve(workId, feedback)         // → { approved, workId, feedback }
agents.reject(workId, reason)            // → { rejected, workId, reason }
agents.signOff(workId, approved, notes)  // → approve/reject result
agents.setDeadline(workId, ms, onTimeout) // → { deadline, workId }
agents.retry(workId, options)            // → { retried, workId, retries }
agents.escalate(workId, reason)          // → { escalated, workId, reason }
agents.setPriority(workId, priority)     // → { priority, workId }

// Communication
agents.join(agentId, conversationId, options)  // → { conversationId, messages, post }
agents.joinGlobal(conversationId, options)     // → { conversationId, messages, post }
agents.emit(agentId, event, data)              // → void
agents.on(agentId, event, callback)            // → void
agents.emitGlobal(event, data)                 // → void
agents.onGlobal(event, callback)               // → void

// Metrics
agents.getMetrics()              // → { total, states, avgLifespan, completed, failed }
agents.getSummary()              // → same as getMetrics
agents.list(userCtx)             // → [{ id, name, role, state, mcp }]
agents.get(agentId)              // → agent object or null

// Class API
new agents.Agents(options)
agentsInstance.spawn(options)    // → { id, name, role, brain }
agentsInstance.list()            // → agent list

// Prototype System
agents.loadProto(name)           // → proto object or null
agents.listProtos()              // → [names]
agents.loadFolder(name)          // → folder proto or null
agents.listFolders()             // → [names]
agents.loadChain(name)           // → [protos with chain]

// Config
agents.getBrainAgentsConfig()    // → { maxAgents }
agents.setBrainAgentsConfig(config) // → boolean
agents.getStackAgentsConfigs()   // → { source, brains, byBrain }

// State
agents.gatherState()             // → { agents: [...], count, gatheredAt }
agents.restoreState(data)        // → { restored }

// Internal
agents.getCurrentAgentId()       // → string
agents.setCurrentAgentId(id)     // → { agentId }
agents.startMCP(options)         // → { tools, status }

// Constants
agents.getLayerStatus()          // → { name, type, version, enabled }
agents.isOperationAllowed()      // → { allowed: true }
agents.getStatus()               // → { enabled, agents: count }
```

### AgentContext (`lib/agent-internal.js`)

```javascript
const internal = require('./lib/agent-internal');
const ctx = internal._getContext(agentId);

// State
ctx.setState('working' | 'idle' | 'paused' | 'approved' | 'rejected')
ctx.toJSON()                     // Serializable for persistence

// Work Items
ctx.setWorkItem(workId, workItem)
ctx.getWorkItem(workId)
ctx.deleteWorkItem(workId)
ctx.getWorkItems()

// Events
ctx.on(event, callback)
ctx.off(event, callback)
ctx.emit(event, data)            // Also emits globally

// Conversations
ctx.getConversation(conversationId)
ctx.addToConversation(conversationId, message)
ctx.clearConversation(conversationId)

// Capabilities
ctx.can('canRead' | 'canWrite' | 'canExecute' | 'canSpawn' | 'canDelete' | 'canNetwork' | 'canRecurse')
ctx.checkRead(userCtx, resource, operation)
```

### Internal Functions (`lib/agent-internal.js`)

```javascript
internal._emit(event, data)
internal._checkSpawnRate(identifier, window, max)
internal._cleanupOldAgents()
internal._saveAgents(contexts)
internal._loadAgents()
internal._runAgentSecurityChain(ctx, task, userCtx)
internal._getMaxAgents()
internal._getMaxAge()
internal.getBrainAgentsConfig()
internal.setBrainAgentsConfig(config)
internal.getStackAgentsConfigs()
internal.gatherState()
internal.restoreState(data)
internal.getCurrentAgentId()
internal.setCurrentAgentId(id)
internal._getContext(agentId)
internal._getOrCreateContext(agentId)
```

---

## 11. Configuration

### config.ini / settings.ini (via `lib/config.js`)

```ini
# Agent settings
agents.maxAgents=200                    # Max concurrent agents
agents.maxAge=86400000                  # Max agent age (ms) = 24 hours
agents.spawnRateLimit=10                # Max spawns per minute per org
agents.defaultSandboxCaps.canRead=true  # Default capability template
agents.defaultSandboxCaps.canWrite=true
agents.defaultSandboxCaps.canExecute=true
agents.defaultSandboxCaps.canSpawn=false
agents.defaultSandboxCaps.canDelete=false
```

### Per-Brain Agent Config

```javascript
// Each brain can have its own agent limits
agents.setBrainAgentsConfig({ maxAgents: 4 });  // For current brain
agents.getBrainAgentsConfig();                   // { maxAgents: 4 }
agents.getStackAgentsConfigs();                  // All brains in stack
```

### Agent Prototypes (Stored in Brain)

Agents can be defined as prototypes in `models/{private,public}/{brain}/agents/`:

**Flat format:** `models/private/vant/agents/claude.md`
```markdown
---
meta:
  name: "Claude"
  description: "Senior engineering assistant"
  chain: ["vant-agent-researcher"]
  metadata:
    skills: ["coding", "architecture", "debugging"]
---
# Claude Agent

System prompt and instructions here...
```

**Folder format:** `models/private/vant/agents/vant-agent-claude/AGENT.md`
```markdown
---
meta:
  name: "Claude"
  description: "Senior engineering assistant"
  chain: ["vant-agent-researcher"]
---
# Claude Agent
...
```

### Loading Prototypes

```javascript
const agents = require('./lib/agents');

// Load by name (searches private then public across brain stack)
const proto = agents.loadProto('claude');
// { name: 'Claude', path: '...', content: '...', description: '...', chain: [...], metadata: {...}, format: 'flat'|'folder' }

// List all available
agents.listProtos();
// ['claude', 'researcher', 'coder', ...]

// Load folder-style proto
agents.loadFolder('claude');

// Load with chain resolution
await agents.loadChain('claude');
// [claude, researcher, ...]
```

### Agent Store Persistence

Agents persisted to `.agent_tmp/agents.json`:

```json
[
  ["agent_abc123", {
    "id": "agent_abc123",
    "name": "Claude",
    "role": "Assistant",
    "type": "default",
    "brain": "vant",
    "state": "idle",
    "created": 1234567890,
    "parent": null,
    "children": [],
    "team": "engineering",
    "roleId": "senior-dev",
    "mcp": true,
    "task": null,
    "feedback": null,
    "pausedAt": null,
    "resumedAt": null,
    "sandboxCaps": { "canRead": true, "canWrite": true, ... },
    "metrics": { "workItemsCompleted": 5, "workItemsFailed": 0, ... }
  }]
]
```

---

## 12. Common Operations

### Spawn Crew for Project

```javascript
const agents = require('./lib/agents');

// Orchestrator (you)
const orchestrator = await agents.spawn({
    name: 'Orchestrator',
    role: 'Lead',
    team: 'project-alpha',
    roleId: 'lead'
});

// Worker 1
const worker1 = await agents.spawn({
    name: 'Backend',
    role: 'Developer',
    team: 'project-alpha',
    roleId: 'backend',
    parent: orchestrator.id
});

// Worker 2
const worker2 = await agents.spawn({
    name: 'Frontend',
    role: 'Developer',
    team: 'project-alpha',
    roleId: 'frontend',
    parent: orchestrator.id
});

// Worker 3
const worker3 = await agents.spawn({
    name: 'QA',
    role: 'Reviewer',
    team: 'project-alpha',
    roleId: 'qa',
    parent: orchestrator.id
});
```

### Delegate Work with Approval Workflow

```javascript
// Async delegate to worker
const { workId } = await agents.delegateAsync(worker1.id, {
    operation: 'execute',
    options: { command: 'npm test' }
});

// Set deadline with auto-escalation
agents.setDeadline(workId, 300000, 'escalate');

// ... later, human reviews ...
await agents.approve(workId, { comment: 'Tests pass' });
```

### Channel Communication

```javascript
// Agent joins project channel
const channel = agents.join(worker1.id, 'project-alpha');

// Post updates
channel.post('Started backend tests', worker1.id);

// Orchestrator listens
agents.on(orchestrator.id, 'task:completed', (data) => {
    console.log('Worker done:', data.workId);
});

// Broadcast to all
agents.emitGlobal('project:status', { phase: 'testing', agents: 3 });
```

### Monitor Fleet

```javascript
// Live metrics
setInterval(() => {
    console.log(agents.getMetrics());
}, 10000);

// List all agents
const fleet = await agents.list();
fleet.forEach(a => console.log(`${a.name} (${a.role}): ${a.state}`));
```

---

## 13. References

- Implementation: `lib/agents.js` (237 lines)
- Internal: `lib/agent-internal.js` (553 lines)
- Lifecycle: `lib/agent-lifecycle.js` (180 lines)
- Delegation: `lib/agent-delegation.js` (298 lines)
- Workflow: `lib/agent-workflow.js` (140 lines)
- Communication: `lib/agent-communication.js` (106 lines)
- Metrics: `lib/agent-metrics.js` (86 lines)
- CLI: `bin/agents.js`, `bin/agent-spawner.js`
- MCP Integration: `lib/mcp.js` (tools: `brain_agent_spawn`, `brain_agent_list`, `brain_agent_kill`)
- Security: `lib/sudo.js`, `lib/sandbox.js`, `lib/vaf.js`, `lib/qos.js`, `lib/escrow.js`, `lib/rls.js`
- Stream Queue: `lib/stream.js`
- Pipeline: `lib/pipeline.js`
- Teams/RBAC: `lib/teams.js`
- Trust: `lib/trust.js`
- Recursion Guards: `lib/recursion.js`
- Config: `lib/config.js`

---

## 14. Version History

| Version | Changes |
|---------|---------|
| v0.8.7 | Multi-agent crew (4 agents), MCP JSON-RPC tools, AgentContext isolation |
| v0.8.7 | Delegation: sync + async with stream queue, recursion guards |
| v0.8.7 | Workflow: approve/reject/signOff/deadline/retry/escalate/priority |
| v0.8.7 | Communication: per-agent channels + global fallback |
| v0.8.7 | Metrics: getMetrics, list, get, getSummary |
| v0.8.7 | Security: per-agent sandbox, sudo escalation for spawn/write, RLS |
| v0.8.7 | Prototype system: loadProto, listProtos, loadChain, folder format |

---

*End of document*