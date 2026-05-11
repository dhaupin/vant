---
version: 0.8.11
permalink: /reference/api-runtime
layout: default
title: Runtime API Reference
nav_order: 1
---

# Runtime API Reference

Complete API reference for lib/vant.js.

## Main Exports

```javascript
const vant = require('./lib/vant');
```

## Functions

### init(options)

Initialize agent.

```javascript
await vant.init({ name, role, id })
```

**Options:**
| Param | Type | Default | What |
|-------|------|---------|------|
| name | string | 'Vant' | Agent name |
| role | string | 'AI Agent' | Agent role |
| id | string | auto | Agent ID |

**Returns:** `{ id, name, role, version, session }`

---

### think(query, opts)

Query brain.

```javascript
await vant.think(query, { topK, maxTokens })
```

**Options:**
| Param | Type | Default | What |
|-------|------|---------|------|
| query | string | required | Search query |
| topK | number | 10 | Results count |
| maxTokens | number | 2000 | Max tokens |

**Returns:** `{ query, insights, memories, islands, tokens, agent }`

---

### learn(key, content)

Store to brain.

```javascript
await vant.learn(key, content)
```

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | category/filename |
| content | string | Content to store |

**Returns:** `{ success: true, key }`

---

### remember(key, content?)

Persist across sessions.

```javascript
// Store
await vant.remember(key, content)

// Recall
await vant.remember(key)
```

**Params:**
| Param | Type | What |
|-------|------|------|
| key | string | Memory key |
| content | string? | Content (optional) |

**Returns:** Stored content or `{ error }`

---

### act(operation, opts)

Execute with lock + audit.

```javascript
await vant.act(operation, { timeout, retries })
```

**Options:**
| Param | Type | Default | What |
|-------|------|---------|------|
| operation | function | required | Operation to execute |
| timeout | number | 30000 | Max time (ms) |
| retries | number | 0 | Retry count |

**Returns:** `{ success, result, duration }` or `{ error, code }`

---

### actWithRetry(operation, opts)

Execute with retries.

```javascript
await vant.actWithRetry(operation, { retries, backoff })
```

**Options:**
| Param | Type | Default | What |
|-------|------|---------|------|
| retries | number | 3 | Retry count |
| backoff | number | 1000 | Backoff multiplier |

---

### getState()

Get agent state.

```javascript
vant.getState()
```

**Returns:** `{ id, name, role, session, uptime, ... }`

---

### getStatus()

Get system status.

```javascript
vant.getStatus()
```

**Returns:** `{ agent, version, brain, search, islands, config }`

---

## Sub-Modules

```javascript
const vant = require('./lib/vant');

// Lazy-loaded modules
vant.getBrain()      // Storage
vant.getSearch()    // Search
vant.getIslands()   // Islands
vant.getLock()      // Lock
vant.getAudit()     // Audit
vant.getConfig()   // Config
vant.getMemoize()  // Cache
```

---

## Constants

```javascript
vant.AGENT_STATE   // Agent state object
vant.VERSION      // Version string
```

---

## Error Codes

| Code | What |
|------|------|
| LOCKED | Brain is locked |
| ERROR | Operation error |
| RETRY_EXHAUSTED | No more retries |