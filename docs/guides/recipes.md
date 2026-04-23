---
permalink: /vant/guides/recipes.html
layout: default
title: Recipes
---
# Recipes

Common patterns for Vant automation and workflows.

## Auto-Sync Brain

Sync brain on exit:

```javascript
// auto-sync.js
const { run } = require('./lib/brain');

async function autoSync() {
  await run.sync();  // Push changes
  process.exit(0);
}

process.on('exit', autoSync);
```

Run before exit:

```bash
# In package.json
"scripts": {
  "prestop": "node auto-sync.js"
}
```

## Multi-Agent Coordination

Each agent on own branch + lock:

```javascript
const branch = require('./lib/branch');
const lock = require('./lib/lock');

const agentId = process.env.VANT_AGENT_ID;

async function work() {
  // Acquire lock
  const token = await lock.acquire(agentId);
  if (!token) return;  // Wait/retry
  
  // Switch to agent branch
  await branch.checkout(agentId);
  
  // Do work...
  await branch.commit(agentId, 'Updated memory');
  
  // Release lock
  await lock.release(agentId, token);
}
```

## Health Check Loop

Periodic health monitoring:

```javascript
const health = require('./lib/health');

async function healthLoop() {
  while (true) {
    const status = await health.check();
    if (status.errors) {
      console.error('Health errors:', status.errors);
    }
    await sleep(60000);  // 1 minute
  }
}
```

## Rate-Limited API Calls

With backoff:

```javascript
async function rateLimitedCall(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 'RATE_LIMITED') {
        await sleep(1000 * Math.pow(2, i));
      } else {
        throw e;
      }
    }
  }
}
```

## GitHub Sync Wrapper

```javascript
const { sync } = require('./lib/sync');

async function syncBrain() {
  try {
    await sync.pull();    // Pull latest
    await sync.push();    // Push changes
  } catch (e) {
    console.error('Sync failed:', e.message);
  }
}
```

## Memory Search

```javascript
const brain = require('./lib/brain');

async function search(query) {
  const files = await brain.load();
  const results = [];
  
  for (const [name, content] of files) {
    if (content.toLowerCase().includes(query.toLowerCase())) {
      results.push({ file: name, content });
    }
  }
  
  return results;
}
```

## Protection Circuit Breaker

Handle MCP overload:

```javascript
const protection = require('./lib/protection');

async function safeCall(fn) {
  if (!protection.check()) {
    throw new Error('Circuit open');
  }
  
  try {
    return await fn();
  } catch (e) {
    protection.open();  // Trip breaker
    throw e;
  }
}
```

## File Lock Acquisition

```javascript
const lock = require('./lib/lock');

async function withLock(agentId, fn) {
  const token = await lock.acquire(agentId);
  try {
    return await fn();
  } finally {
    if (token) await lock.release(agentId, token);
  }
}
```

## Scheduled Sync

```javascript
// Run every hour
setInterval(async () => {
  const sync = require('./lib/sync');
  await sync.pull();
  await sync.push();
}, 3600000);
```

## Watch Mode

```javascript
const { watch } = require('./lib/watch');

watch('models/public/', async (file) => {
  console.log('Changed:', file);
  await sync.push();
});
```

See also: [CLI Reference](../reference/cli.md), [Multi-Agent](./multi-agent.md), [Configuration](../reference/configuration.md)

## VAF Input Check

Check input before passing to MCP:

```javascript
const vaf = require('./lib/vaf');

async function safeCall(name, args) {
  // Validate inputs first
  for (const [key, value] of Object.entries(args)) {
    vaf.check(value, { type: 'string', name: key });
  }
  
  return await mcp.call(name, args);
}
```

## Error Handling

Parse Vant errors:

```javascript
const errors = require('./lib/errors');

try {
  await operation();
} catch (e) {
  if (e.code === errors.E_NOT_FOUND) {
    // Handle missing
  } else if (e.code === errors.E_LOCKED) {
    // Handle locked
  } else {
    throw e;
  }
}
```

## Wait for Lock

```javascript
async function waitForLock(agentId, timeout = 30000) {
  const start = Date.now();
  
  while (true) {
    const token = await lock.acquire(agentId);
    if (token) return token;
    
    if (Date.now() - start > timeout) {
      throw new Error('Lock timeout');
    }
    
    await sleep(1000);
  }
}
```