---
version: 0.8.6
permalink: /operations/testing
layout: default
title: Testing
nav_order: 63
---

# Tutorial: Testing & Debugging

> Debug Vant issues and write tests for your agents

## Debug Mode

### Enable Debug

Debug logging is always enabled in the `vant all` server modes:

```bash
# MCP server with debug output
vant mcp

# Same for the REST API or both
vant api
vant all
```

For a standalone MCP server process:

```bash
# HTTP server mode on a chosen port
node bin/mcp.js --server --port 3457

# Or stdio mode for a single AI client
node bin/mcp.js --stdio
```

### Debug Commands

```bash
# Health check (quiet output with -q)
vant health

# Sync status
vant sync --status

# Pull manually
vant sync --pull
```

## Common Issues

### Brain Won't Load

```bash
# Check brain files
ls -la models/public/

# Check system health
vant health
```

### Sync Fails

```bash
# Pull manually
vant sync --pull

# Check token
echo $GITHUB_TOKEN | head -c 5
```

### Locked Brain

```bash
# Check lock status
vant lock status

# Force release (admin)
vant lock force
```

## Write Tests

### Unit Test

The repo's tests are plain-Node scripts with assert (no mocha/jest
runner). A unit test looks like:

```javascript
const assert = require('assert');
const vant = require('vant');

(async () => {
    const inited = await vant.init({ name: 'Test' });
    assert(!inited.error);

    const thought = await vant.think('test query');
    assert(Array.isArray(thought.insights));

    const learned = await vant.learn('test', 'content');
    assert(learned.success);

    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
```

### Run Tests

There are no test:watch/test:coverage npm scripts. The real surface:

```bash
# Smoke (build-test)
npm test

# Full runner (all suites)
node test/runner.js

# Coverage summary
node test/coverage.js

# The CI battery end to end
node test/ci.js

# One suite
node test/brain.test.js
```

---

## More

See [CI](/vant/operations/ci) for CI setup.