# Vant Module Reference

Core libraries in `lib/`.

---

## config.js

Configuration loader. Reads from `config.ini` and environment variables.

```javascript
const config = require('./lib/config');

// Get a config value
config.GITHUB_REPO;  // 'owner/repo'
config.GITHUB_TOKEN; // from env or config
config.runtime?.MAX_REQUESTS_PER_HOUR;
```

**Priority:** env var > config.ini > defaults

---

## logger.js

Structured logging with levels, formatting, rotation.

```javascript
const logger = require('./lib/logger');

logger.info('System ready');
logger.error('Failed', { code: 'ENOENT' });
logger.debug('Details', { data: obj });
```

### Options

```javascript
logger.setLevel('debug');    // debug, info, warn, error
logger.setFormat('json');    // json or text
logger.setOutput('both');    // console, file, both
```

### Log Files

- Location: `logs/vant.log`
- Rotates at 5MB, keeps 5 backups
- JSON format: `{"timestamp":"...","level":"info","message":"...","data":{}}`

---

## errors.js

Unified error handling with codes and retry.

```javascript
const errors = require('./lib/errors');

// Create error with code
throw new errors.VantError('Failed', { 
    code: errors.CODES.GITHUB_AUTH,
    retryable: true 
});

// Retry with backoff
await errors.retry(async () => {
    return await riskyOperation();
}, 3);

// Wrap async function
const safeFn = errors.wrap(asyncOperation, 'context');
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `CONFIG_MISSING` | Config file not found | No |
| `CONFIG_INVALID` | Config is invalid | No |
| `GITHUB_AUTH` | Authentication failed | No |
| `GITHUB_NOT_FOUND` | Resource not found | No |
| `GITHUB_RATE_LIMIT` | Hit GitHub limit | Yes |
| `GITHUB_SYNC_FAIL` | Sync failed | Yes |
| `BRAIN_LOAD_FAIL` | Failed to load brain | No |
| `BRAIN_SAVE_FAIL` | Failed to save brain | No |
| `NETWORK_TIMEOUT` | Request timed out | Yes |
| `NETWORK_OFFLINE` | No network connection | Yes |
| `LOCK_TIMEOUT` | Couldn't acquire lock | Yes |
| `STEGO_*` | Stego errors (invalid PNG, etc) | No |
| `DECRYPT_FAIL` | Decryption failed | No |
| `UNKNOWN` | Unknown error | Depends |

---

## lock.js

Multi-agent locking to prevent race conditions.

```javascript
const lock = require('./lib/lock');

// Acquire lock
const acquired = await lock.acquire('agent-1', 60000);
if (acquired) {
    // do work
    await lock.release();
}

// Check status
const status = lock.status();
// { agentId, age, valid, stale }
```

### Features

- Atomic file operations (rename)
- Token-based ownership verification
- 3x retry with 50ms backoff
- Auto-expire after timeout

---

## branch.js

Git branch management per agent session.

```javascript
const branch = require('./lib/branch');

// Checkout/create branch for agent
await branch.checkout('agent-1');

// Commit with agent prefix
await branch.commit('agent-1', 'Made changes');

// Push to remote
await branch.push();

// Merge to main
await branch.merge('agent-1');
```

### Branch Naming

Uses `agents/{agentId}` prefix, e.g., `agents/agent-1`

---

## rate-limit.js

GitHub API rate limit tracking.

```javascript
const rateLimit = require('./lib/rate-limit');

// Check if can make request
if (rateLimit.canMakeRequest()) {
    // make request
    rateLimit.recordRequest();
}

// Get status
const status = rateLimit.getStatus();
// { remaining, maxPerHour, resetIn }
```

---

## stego.js

Steganography for encoding/decoding in PNG images.

```javascript
const stego = require('./lib/stego');

// Encode (with optional encryption)
stego.encode('secret', 'cover.png', 'output.png', { 
    encrypt: 'password' 
});

// Decode
const msg = stego.decode('output.png', { 
    decrypt: 'password' 
});
```

See [STEGO.md](./STEGO.md) for full documentation.

---

## brain.js

Brain file loader (vant-brain only).

```javascript
const brain = require('./lib/brain');

// Load brain into context
const context = brain.load(version);

// Get specific file
const identity = brain.getFile('identity');
```

---

## auto-update.js

Auto-save on exit (vant-brain only).

```javascript
const autoUpdate = require('./lib/auto-update');

// Enable auto-save
autoUpdate.enable();

// On exit, saves current state to GitHub
```

---

## notifications.js

Slack and Discord webhook notifications.

```javascript
const notifications = require('./lib/notifications');

// Slack
await notifications.slack('Deploy complete', { channel: '#deploys' });

// Discord
await notifications.discord('Brain synced', { embed: true });

// Both
await notifications.broadcast('Health check ok', { slack: '#ops', discord: true });

// Events
await notifications.event('sync', { files: 5, branch: 'main' });
await notifications.event('health', { status: 'ok' });
await notifications.event('error', { message: 'Failed to connect' });
```

Environment: `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`

---

## telegram.js

Telegram bot API wrapper.

```javascript
const telegram = require('./lib/telegram');

// Send message
await telegram.send(chatId, 'Hello from VANT!');

// Register command
telegram.onCommand('status', async (msg) => {
    await telegram.send(msg.chat, 'VANT is running');
});

// Register message handler
telegram.onMessage(async (msg) => {
    console.log('Received:', msg.text);
});

// Start polling
await telegram.startPolling();
```

Environment: `TELEGRAM_BOT_TOKEN`

---

## mcp.js

MCP (Model Context Protocol) server exposing VANT brain as AI tools.

```javascript
// HTTP server
const mcp = require('./bin/mcp');

// Tools available
const { TOOLS, getMemory, checkHealth } = mcp;
```

**Run as HTTP server:**

```bash
node bin/mcp.js --server
# Endpoints: GET /tools, GET /health, POST /call
```

**Run as AI SDK stdio:**

```bash
node bin/mcp.js --stdio
```

See [README.md](./README.md#mcp-server) for full usage.

---

## Related

- [CLI.md](./CLI.md) - Command reference
- [AGENTS.md](../AGENTS.md) - Multi-agent workflows
- [STEGO.md](./STEGO.md) - Steganography docs
- [ROADMAP.md](./ROADMAP.md) - Future features
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [README.md](./README.md#mcp-server) - MCP server docs