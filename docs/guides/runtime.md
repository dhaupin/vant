---
version: 0.8.11
permalink: /guides/runtime
layout: default
title: Runtime API
nav_order: 3
---

# Runtime API

Programmatic usage of the Vant runtime (lib/vant.js). For CLI usage, see [CLI](cli).

## Quick Start

Initialize the Vant runtime in your code:

```javascript
const vant = require('./lib/vant');

// Initialize agent
await vant.init({ name: 'MyAgent', role: 'Assistant' });
```

## Core API

### init(options)

Initialize the agent and load brain identity.

Initialize the agent:

```javascript
const vant = require('./lib/vant');

const state = await vant.init({
    name: 'MyAgent',
    role: 'Assistant',
    id: 'agent_abc123'  // optional, auto-generated
});

console.log(state.name);      // "MyAgent"
console.log(state.role);     // "Assistant"
console.log(state.session);  // timestamp
console.log(state.version); // "0.8.6"
```

This loads your identity from brain. If `identity.md` exists, it uses that name/role instead.

### think(query, opts)

Query your brain - the main thinking operation.

Query your brain:

```javascript
const result = await vant.think('authentication', { topK: 10, maxTokens: 2000 });

console.log(result.query);      // "authentication"
console.log(result.insights);  // [{ id, title, relevance, preview }]
console.log(result.memories);  // full matching memories
console.log(result.triggers);  // detected island triggers
console.log(result.tokens);   // estimated tokens used
```

**Options:**

| Option | Default | What |
|--------|---------|------|
| topK | 10 | Number of results |
| maxTokens | 2000 | Max tokens to return |

Returns: `{ query, insights, memories, islands, tokens, agent }`

### learn(key, content)

Store new information to your brain.

Store a new learning:

```javascript
await vant.learn('learnings/python', '- Use uv for Python projects');
console.log(result.success); // true
```

The key format is `category/filename`. Stores to brain + memoizes for fast recall.

### remember(key, content)

Persist information across sessions.

Remember something permanently:

```javascript
// Store
await vant.remember('user_preferences', { theme: 'dark', language: 'en' });

// Recall
const prefs = await vant.remember('user_preferences');
console.log(prefs); // { theme: 'dark', language: 'en' }
```

### act(operation, options)

Execute an operation with lock and audit.

Execute an operation:

```javascript
const result = await vant.act(async () => {
    // your code here
    return { success: true, data: 'done' };
}, { timeout: 30000, retries: 0 });

console.log(result.success); // true
console.log(result.result); // { success: true, data: 'done' }
console.log(result.duration); // execution time in ms
```

If another agent holds the lock:

```javascript
const result = await vant.act(() => doWork());
if (result.error) {
    console.log(result.code); // "LOCKED"
}
```

### actWithRetry(operation, options)

Execute with automatic retries.

Execute with retries:

```javascript
const result = await vant.actWithRetry(async () => {
    return await flakyOperation();
}, { retries: 3, backoff: 1000 });
```

**Options:**

| Option | Default | What |
|--------|---------|------|
| timeout | 30000 | Max operation time |
| retries | 0 | Retry count |
| backoff | 1000 | Backoff multiplier |

### getState()

Get current agent state.

Get agent state:

```javascript
const state = vant.getState();
console.log(state.id);       // agent ID
console.log(state.name);    // agent name
console.log(state.role);     // agent role
console.log(state.session);  // session start
console.log(state.uptime);  // ms since start
```

### getStatus()

Get system status.

Get system status:

```javascript
const status = vant.getStatus();
console.log(status.agent);   // "Vant"
console.log(status.version); // "0.8.6"
console.log(status.brain);   // brain version
console.log(status.search);  // search status
console.log(status.islands); // islands status
console.log(status.config); // "prod" | "dev"
```

## Modules

Access sub-modules directly:

```javascript
const vant = require('./lib/vant');

// Lazy-loaded
const brain = vant.getBrain();
const search = vant.getSearch();
const islands = vant.getIslands();
const lock = vant.getLock();
const audit = vant.getAudit();
```

---

## Example: Full Agent Loop

A simple agent loop using the runtime:

```javascript
const vant = require('./lib/vant');

async function runAgent(prompt) {
    // Initialize
    await vant.init({ name: 'Agent' });
    
    // Think about the prompt
    const context = await vant.think(prompt);
    
    // Do work (with lock)
    const result = await vant.act(async () => {
        // Use context.memories to inform decision
        return { response: 'Done' };
    });
    
    // Learn from this session
    await vant.learn('sessions/last', `Ran: ${prompt} -> ${result.response}`);
    
    return result;
}

runAgent('check authentication docs');
```

---

## Security

All operations go through the sandbox:

```javascript
// Sandbox checks read permission
const brain = vant.getBrain();
await brain.get('learnings', 'lesson-1');

// Sandbox checks write permission
await vant.learn('learnings/new', 'content');

// Sandbox checks network permission
const network = vant.getNetwork();
await network.fetch('https://api.example.com');
```

See [Sandbox](sandbox) and [Security](security) for details.