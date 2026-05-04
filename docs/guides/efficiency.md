# Efficiency & Performance Guide

> Guide to optimizing Vant for minimal API usage, fast execution, and token conservation.

---

## Overview

Vant is designed for efficiency - this guide covers the built-in optimizations and how to use them.

---

## Config Caching

Vant caches all config in memory - no repeated file reads:

```javascript
const config = require('./lib/config');

// First call reads from file:
const repo = config.get('GITHUB_REPO');

// Subsequent calls use cache:
const repo2 = config.get('GITHUB_REPO');  // instant ✓
```

---

## Message History Limits

Auto-update limits in-memory messages:

```javascript
// lib/auto-update.js
const MAX_MESSAGES_TO_SUMMARIZE = 50;

// Automatically trims old messages
if (messageHistory.length > MAX_MESSAGES_TO_SUMMARIZE) {
    messageHistory = messageHistory.slice(-MAX_MESSAGES_TO_SUMMARIZE);
}
```

---

## Token Estimation

Cheap token estimation (no LLM call needed):

```javascript
// ~4 chars per token (rough estimate)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
```

---

## Buffer Size Limits

Entropy processing prevents large input DoS:

```javascript
// lib/entropy.js
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

// Input validation
if (buffer.length > MAX_BUFFER_SIZE) {
    throw new Error('Input too large: max 10MB');
}
```

---

## Rate Limiting

Built-in GitHub API rate limiting:

```javascript
// lib/rate-limit.js
const DEFAULT_MAX_PER_HOUR = 360;

if (!canMakeRequest()) {
    // Wait or skip
    return;
}
recordRequest();
```

---

## Reducing GitHub API Calls

### Batch Operations

Instead of individual calls, batch commits:

```javascript
// Instead of:
commit('Change 1');
commit('Change 2');
commit('Change 3');

// Do single commit:
commit('Change 1; Change 2; Change 3');
```

### Check Before Sync

Use `git status` to avoid unnecessary network calls:

```javascript
// In bin/sync.js
const status = execSync('git status --porcelain', { encoding: 'utf8' });
if (!status.trim()) {
    console.log('[Sync] No changes to push');
    return;  // Skip network call
}
```

---

## MCP Connection Handling

MCP server uses Express with built-in connection reuse:

```javascript
// bin/mcp.js - Express handles keep-alive implicitly
const app = express();
app.use(...);  // Reuses connections
```

---

## Memory Optimization

### File Read Caching

Brain files can be cached in memory:

```javascript
// lib/brain.js already caches:
let currentBrain = {
    identity: null,
    learnings: {},
    // ...
};
```

---

## Environment Variables

For maximum efficiency, use environment variables to skip config parsing:

```bash
# Instead of config.ini:
export GITHUB_TOKEN="ghp_..."
export GITHUB_REPO="user/repo"

# Vant reads env directly
```

---

## Quick Reference

| Optimization | How | Benefit |
|---------------|-----|---------|
| Config cache | `_config` variable | No file re-reads |
| Message trim | `MAX_MESSAGES_TO_SUMMARIZE` | Bounded memory |
| Buffer limits | `MAX_BUFFER_SIZE` | DoS prevention |
| GitHub rate | `rate-limit.js` | API conservation |
| Status check | `git status` before push | Skip unnecessary calls |
| Token est. | `text.length / 4` | No LLM call |

---

## Related

- [Security Guide](security.md) - Input validation & security
- [Configuration](configuration.md) - Config options