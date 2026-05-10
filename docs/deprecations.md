---
version: 0.8.6
permalink: /deprecations
layout: default
title: Deprecations
nav_order: 99
---

> Track deprecated, orphaned, and planned-for-removal files.

## v0.8.6 - Current (2026-05-08)

### Changed

| File | Notes |
|------|-------|
| `lib/stego.js` | Removed stego mode for messages - use only Encrypt |
| `lib/msg.js` | Removed stego options - use config for encryption |
| `lib/encrypt.js` | Deprecated legacy methods - see below |

### Deprecated (Still Works - Will Remove)

| Method | Use Instead |
|--------|-------------|
| `Encrypt.encrypt/decrypt` | `Encrypt.aesGcmEncrypt/aesGcmDecrypt` |
| `Encrypt.encode()` | `Encrypt.aesGcmEncrypt()` |
| `Encrypt.decode()` | `Encrypt.aesGcmDecrypt()` |
| `Encrypt.pbkdf2Sync()` | Node.js `crypto.pbkdf2Sync()` |

### Deleted (No Replacements - BREAKING)

| File | Notes |
|------|-------|
| `lib/conversation.js` | Use `lib/msg.js` - unified Msg class |
| `lib/ipc.js` | Use `lib/msg.js` - Channel API |

### All Resolved ✓

| File | Resolution | Status |
|------|------------|--------|
| `lib/env.js` | ✅ Resolved | Now re-exports from config |
| `lib/config-flag.js` | ✅ Resolved | Now re-exports from config |
| `lib/buffer.js` | ✅ Resolved | Now re-exports from pool |
| `lib/storage.js` | ✅ Resolved | Now re-exports from pool |
| `lib/audit-log.js` | ✅ Resolved | Now re-exports from audit |
| `lib/metrics.js` | ✅ Resolved | Now re-exports from audit |
| `lib/horcrux.js` | ✅ Resolved | Now re-exports from stego |
| `lib/rerank.js` | ✅ Resolved | Now re-exports from search |
| `lib/search-hybrid.js` | ✅ Resolved | Now re-exports from search |
| `lib/search-hyde.js` | ✅ Resolved | Now re-exports from search |
| `lib/serializer.js` | ✅ Resolved | Now re-exports from compression |
| `lib/entropy.js` | ✅ Resolved | Now re-exports from compression |

### Use Instead

| File | Use Instead | Notes |
|-------|-----------|-------|
| `lib/env.js` | `lib/config` | Re-exports for backward compat |
| `lib/config-flag.js` | `lib/config` | Use config.get/set |
| `lib/buffer.js` | `lib/pool` | Use pool.allocate |
| `lib/storage.js` | `lib/pool` | Use pool.get/set |
| `lib/audit-log.js` | `lib/audit` | Use audit.log |
| `lib/metrics.js` | `lib/audit` | Use audit.increment |
| `lib/horcrux.js` | `lib/stego` | Use stego.encode |
| `lib/rerank.js` | `lib/search.rerank` | Use search.rerank |
| `lib/search-hybrid.js` | `lib/search` | Use search.queryBrain |
| `lib/search-hyde.js` | `lib/search` | Use search.queryBrain |
| `lib/serializer.js` | `lib/compression` | Use compression.serialize |
| `lib/entropy.js` | `lib/compression` | Use compression.shannonEntropy |

### Stub Pattern

All legacy stubs follow this pattern:

```javascript
// lib/entropy.js (example)
const compression = require('./compression');

module.exports = {
    calculateShannonEntropy: compression.calculateShannonEntropy,
    // ... other exports
};
```

### Cleanup Status

| Category | Count |
|----------|-------|
| Resolved | 12 |
| Pending | 0 |
| Total | 12 |

## v0.8.5 - 2026-05-07

- lib/rerank.js → search.js
- lib/search-hybrid.js → search.js
- lib/search-hyde.js → search.js

## v0.8.4 - 2026-05-06

- lib/gallery.js - Moved to gallery.js
