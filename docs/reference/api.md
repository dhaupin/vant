---
permalink: /api.html
---


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

## lib/health.js

```javascript
const health = require('./lib/health');

await health.run();        // Run all checks
const status = await health.check(); // Get status
```

## lib/logger.js

```javascript
const logger = require('./lib/logger');

logger.info('message');
logger.warn('warning');
logger.error('error');
```

## lib/version.js

```javascript
const version = require('./lib/version');

version.get();    // Get current version
version.bump('patch'); // Bump version
```

## lib/succession.js

```javascript
const succession = require('./lib/succession');

await succession.get();     // Get current version
await succession.trust();   // Mark trusted
await succession.diff();    // Compare to previous
```

## lib/protection.js

```javascript
const protection = require('./lib/protection');

protection.enable();   // Enable circuit breaker
protection.disable(); // Disable
protection.trigger(); // Trigger protection
```

## lib/rate-limit.js

```javascript
const rateLimit = require('./lib/rate-limit');

await rateLimit.check();    // Check remaining
await rateLimit.wait();    // Wait if needed
rateLimit.getResetTime();  // Get reset time
```

## lib/auto-update.js

```javascript
const autoUpdate = require('./lib/auto-update');

autoUpdate.enable();    // Enable auto-save
autoUpdate.disable();  // Disable
autoUpdate.trigger();  // Trigger save
```

## lib/onboard.js

```javascript
const onboard = require('./lib/onboard');

await onboard.query('question');
await onboard.list();    // List available
```

## lib/errors.js

```javascript
const errors = require('./lib/errors');

errors.get(code);
errors.format(error);
```

## lib/load.js

```javascript
const load = require('./lib/load');

await load.files();      // Load all files
await load.file(path);  // Load single file
```

## lib/colors.js

```javascript
const colors = require('./lib/colors');

colors.red('error');
colors.green('success');
colors.yellow('warning');
colors.cyan('info');
```

## lib/progress.js

```javascript
const progress = require('./lib/progress');

progress.start(total);
progress.update(current);
progress.complete();
```

## lib/prompts.js

```javascript
const prompts = require('./lib/prompts');

prompts.get('question');
prompts.list();
```

## lib/verbosity.js

```javascript
const verbosity = require('./lib/verbosity');

verbosity.get();     // Current level
verbosity.set('info');
verbosity.increase();
verbosity.decrease();
```

## lib/stego.js

```javascript
const stego = require('./lib/stego');

stego.encode(message, image);
stego.decode(image);
```

## lib/notifications.js

```javascript
const notifications = require('./lib/notifications');

notifications.send('title', 'message');
notifications.list();
```

See also: [CLI Commands](./cli.md), [Schema](./schema.md)
