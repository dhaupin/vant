---
version: 0.8.4
title: Module API
slug: /api
order: 5
---

# Module API

## lib/config.js

```javascript
const config = require('./lib/config');

config.get('github.repo');
config.get('paths.models');
config.set('node.pollInterval', 30);
```

## lib/brain.js

```javascript
const brain = require('./lib/brain');

await brain.load();      // Load all brain files
await brain.get(key);  // Get file content
await brain.set(key, content); // Set file content
await brain.save();   // Save to disk
```

## lib/lock.js

```javascript
const lock = require('./lib/lock');

await lock.acquire(agentId);
await lock.release(agentId, token);
```

## lib/branch.js

```javascript
const branch = require('./lib/branch');

branch.currentBranch();
branch.checkout(branchName);
branch.commit(agentId, message);
```

## lib/vaf.js

```javascript
const vaf = require('./lib/vaf');

vaf.validate(input);
vaf.sanitize(input);
```

See also: [CLI Commands](./cli.md), [Schema](./schema.md)
