---
permalink: /guides/examples.html
layout: default
title: Examples
---
# Examples

Working examples for Vant workflows.

## Basic: Load and Query

```javascript
const vant = require('./lib/vant');

async function main() {
  // Load brain
  await vant.load();
  
  // Query memory
  const result = await vant.query('what are my goals?');
  console.log(result);
}

main();
```

## Basic: Save Memory

```javascript
const vant = require('./lib/vant');
const fs = require('fs');

async function saveLesson(lesson) {
  const content = fs.readFileSync('lesson.txt', 'utf8');
  await vant.save('lessons.md', content);
}
```

## MCP Server

```javascript
const mcp = require('./bin/mcp');

mcp.run({
  port: 3456,
  apiKey: process.env.MCP_API_KEY
});
```

## With VAF Validation

```javascript
const vaf = require('./lib/vaf');

function validate(input) {
  try {
    vaf.check(input, {type: 'string', maxLength: 50000});
    return true;
  } catch (e) {
    console.error('Blocked:', e.message);
    return false;
  }
}
```

## With Rate Limiting

```javascript
const protection = require('./lib/protection');

function limitedCall(fn) {
  if (!protection.check()) {
    throw new Error('Rate limited');
  }
  return fn();
}
```

## Health Check

```javascript
const health = require('./lib/health');

async function check() {
  const status = await health.check();
  console.log('Status:', status);
}
```

## GitHub Sync

```javascript
const sync = require('./lib/sync');

async function sync() {
  await sync.pull();
  await sync.push();
}
```

## Branch Work

```javascript
const branch = require('./lib/branch');

async function work() {
  const current = await branch.currentBranch();
  await branch.checkout('agent-1');
  // do work...
  await branch.commit('agent-1', 'Updated');
}
```

## Lock Work

```javascript
const lock = require('./lib/lock');

async function safeWork(fn) {
  const token = await lock.acquire('agent-1');
  try {
    return await fn();
  } finally {
    if (token) await lock.release('agent-1', token);
  }
}
```

See also: [Operations](./vant/operations.md), [API Reference](../vant/reference/api.md)