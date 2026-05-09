---
version: 0.8.6
permalink: /reference/api
layout: default
title: API Reference
nav_order: 2
---

> Vant Agent OS API Reference.

## Runtime

Initialize and manage the agent.

### init(options)

Initialize the agent.

```javascript
const runtime = require('./lib/runtime');

const state = await runtime.init({
    name: 'Vant',      // Agent name
    role: 'AI Agent'   // Agent role
});
```

**Returns:** `{ id, name, role, session }`

### think(query, options)

Query brain for context.

```javascript
const result = await runtime.think('who am I', {
    topK: 10,        // Max memories
    maxTokens: 2000   // Max tokens
});
```

**Returns:** `{ query, triggers, insights, memories, tokens, agent }`

### learn(key, content)

Store new information to brain.

```javascript
await runtime.learn('key', 'Content to remember');
```

**Returns:** `{ success, key }`

### remember(key, content?)

Remember across sessions.

```javascript
// Store
await runtime.remember('key', 'content');

// Recall
const content = await runtime.remember('key');
```

### act(operation, options)

Execute operation with locks.

```javascript
const result = await runtime.act(() => {
    return doSomething();
}, { timeout: 30000 });
```

**Returns:** `{ success, result, duration }`

### getTools()

Get available tools.

```javascript
const tools = runtime.getTools();
// [{ name, description }, ...]
```

### getState()

Get current agent state.

```javascript
const state = runtime.getState();
// { id, name, role, uptime, ... }
```

### getStatus()

Get system status.

```javascript
const status = runtime.getStatus();
// { agent, version, enabled, ... }
```

## Agents

Multi-agent runtime.

### spawn(options)

Spawn a new agent.

```javascript
const agents = require('./lib/agents');

const agent = await agents.spawn({
    name: 'Helper',
    role: 'Assistant',
    type: 'default'
});
```

**Returns:** `{ id, name, role }`

### fork()

Fork self for parallel work.

```javascript
const forked = await agents.fork();
```

### join(conversationId)

Join shared conversation.

```javascript
const conv = agents.join('session-1');
conv.post('message', 'author');
const messages = conv.messages;
```

### emit(event, data)

Emit signal to other agents.

```javascript
agents.emit('taskComplete', { status: 'done' });
```

### on(event, callback)

Listen for events.

```javascript
agents.on('taskComplete', (data) => {
    console.log(data.status);
});
```

### list()

List all agents.

```javascript
const all = agents.list();
// [{ id, name, role, state }, ...]
```

## IPC

Inter-agent messaging.

### send(channel, message)

Send message to channel.

```javascript
const ipc = require('./lib/ipc');

ipc.send('alerts', { text: 'Hello' });
```

### subscribe(channel, handler)

Subscribe to channel.

```javascript
ipc.subscribe('alerts', (msg) => {
    console.log(msg.text);
});
```

### messages(channel)

Get channel messages.

```javascript
const msgs = ipc.messages('alerts');
```

## Brain

Direct brain access.

### get(key)

Get brain file.

```javascript
const brain = require('./lib/brain');

const data = await brain.get('identity');
// { key, content, date }
```

### write(key, content)

Write brain file.

```javascript
brain.write('key', '# Content');
```

### append(key, content)

Append to brain file.

```javascript
brain.append('key', 'More content');
```

### has(key)

Check if brain file exists.

```javascript
brain.has('identity'); // true/false
```

### queryBrain(query, options)

Query brain using search.

```javascript
const result = await brain.queryBrain('query', {
    topK: 10,
    maxTokens: 2000
});
```

## Search

Query brain memories.

### queryBrain(query, options)

Query brain for context.

```javascript
const search = require('./lib/search');

const result = await search.queryBrain('query', {
    topK: 10,
    maxTokens: 2000
});
// { memories, stats }
```

### rerank(memories, query, topK)

Rank memories by relevance.

```javascript
const ranked = search.rerank(memories, query, 10);
```

## Islands

Intent detection and lazy-loading.

### findTriggers(prompt)

Find islands matching prompt.

```javascript
const islands = require('./lib/islands');

const triggers = islands.findTriggers('create a github pr');
// ['github', 'linear']
```

### autoHydrate(prompt)

Auto-load needed islands.

```javascript
const data = islands.autoHydrate('create github pr');
```

### getAvailable()

Get available islands.

```javascript
const available = islands.getAvailable();
// ['identity', 'learnings', 'github', ...]
```

## Config

Get configuration.

### get(key)

Get config value.

```javascript
const config = require('./lib/config');

const port = config.get('server.port');
// 3100
```

### githubToken()

Get GitHub token.

```javascript
const token = config.githubToken();
```

## Lock

Acquire/release locks.

### acquire(agentId, timeout)

Acquire lock.

```javascript
const lock = require('./lib/lock');

lock.acquire('agent_123', 10000);
```

### release(agentId)

Release lock.

```javascript
lock.release('agent_123');
```

## Audit

Logging and metrics.

### log(entry)

Log entry.

```javascript
const audit = require('./lib/audit');

audit.log({ type: 'act', key: 'value' });
```

### increment(metric)

Increment metric.

```javascript
audit.increment('requests');
```

## Errors

Error handling.

### handle(error)

Handle error.

```javascript
const errors = require('./lib/errors');

errors.handle(new Error('msg'));
```
