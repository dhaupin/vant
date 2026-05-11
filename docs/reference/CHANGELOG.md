---
version: 0.8.6
permalink: /changelog
layout: default
title: Changelog
nav_order: 1
---

> Vant release history.

## v0.8.6 (Unreleased)

### Refactor: File Persistence + Legacy Cleanup

- **Circuit Breakers**: Add file persistence for all circuit breakers (survive restarts)
  - Naming: `.circuit-<name>.json` format
  - `.circuit-sync.json`, `.circuit-network.json`, `.circuit-escrow.json`, `.circuit-vaf.json`, `.circuit-auth.json`
  - Gitignore: `.circuit*.json` ignores all
  - Removed `states/active/` directory (legacy)

- **Remove Legacy Resolution External Files**
  - Resolution now scans brain files for in-file `status:` metadata
  - Deleted `.resolution.json` ledger file
  - In-file resolution is now single source of truth

## v0.8.6

### Refactor: Encrypt Security Update

- **CTR → GCM**: `encrypt/decrypt` now uses AES-256-GCM
  - New format: `salt:iv:authTag:encrypted` (previously was `salt:iv:encrypted`)
  - Authenticated encryption - detects tampering
- **Remove md5**: Use `sha256()` for cache keys
- **Add RSA**: Full asymmetric crypto
  - `rsaKeyPair(bits)` → `{ publicKey, privateKey }`
  - `rsaEncrypt/Decrypt` → OAEP-SHA256
  - `rsaSign/Verify` → SHA256
- **Add Signed Tokens**: JWT-like token system
  - `Encrypt.signToken(payload, secret, expiresIn)`
  - `Encrypt.verifyToken(token, secret)`
  - Used by Auth for proper token validation

### Refactor: Auth Token System

- `generateToken()` now returns signed JWT-like tokens
- `validateToken()` verifies signature + expiry
- Tokens include: userId, role, iat, exp
- Configurable via `VANT_TOKEN_SECRET` env

### Deprecations

| Method | Use Instead |
|--------|-------------|
| `Encrypt.encrypt/decrypt` | `Encrypt.aesGcmEncrypt/aesGcmDecrypt` |
| `Encrypt.encode/decode` | `Encrypt.aesGcmEncrypt/aesGcmDecrypt` |
| `Encrypt.pbkdf2Sync` | `crypto.pbkdf2Sync()` |

### Fix: aesGcmEncrypt/Decrypt

- Returns hex string (was Buffer)
- Now consistent with other Encrypt methods

### Refactor: Storage Module (v0.8.6 Breaking)

- **Remove old modules**: `brain.js`, `vector-store.js`, `state.js`, `repos.js` deleted
- **New Storage class**: `lib/storage/index.js` - unified storage abstraction
  - `Storage.get('brain')` → BrainStorage instance
  - `Storage.get('vector')` → VectorStorage instance
  - `Storage.get('state')` → StateStorage instance
  - `Storage.get('config')` → ConfigStorage instance
  - `Storage.get('lock')` → LockStorage instance
  - `Storage.get('islands')` → IslandStorage instance
  - `Storage.get('repos')` → ReposStorage instance
- **Connectors**: `lib/storage/connectors/` - pluggable storage backends
  - `FileStorage` (default) - filesystem-based
  - `PineconeConnector` - vector database
- **Breaking**: All consumers updated to use `Storage.get('brain')` instead of `require('./brain')`
- **API**:
  ```js
  const Storage = require('./storage');
  const brain = Storage.get('brain');
  await brain.write('file.md', content);
  const data = await brain.read('file.md');
  ```


## v0.8.6

### Refactor: Stego → Encrypt (v0.8.6)

- Modified `lib/stego.js` - Remove duplicate encrypt/decrypt code
- Now uses Encrypt class: `Encrypt.aesGcmEncrypt/Decrypt`
- Simplified `createBootstrap/parseBootstrap` functions
- Removed HORCRUX constants (unused)
- Removed buffer mode (for image carriers only, not messages)

### Refactor: Msg Cleanup

- Modified `lib/msg.js` - Remove stego mode
- `lib/msg.js` now uses only Encrypt for messages
- Added config settings: `msg.encrypted`, `msg.autoEncrypt`
- Added `decrypt(messageContent)` and `revealAuto(messageContent)`
- Removed: `stego` option, `reveal()` method, `isStego()` helper

### New: Msg Class

- Added `lib/msg.js` (498 lines) - Unified agent-to-agent messaging
- Merge: conversation.js + ipc.js → Msg class
- Features:
  - Conversation API (create, post, reply, participants)
  - Channel API (IPC-style send/subscribe/publish)
  - Encryption: plain, encrypt (AES-256-GCM)
  - Auto-detect + explicit reveal options
  - Security: VAF, QoS (500/min), Escrow, Event
- Config: `msg.encrypted`, `msg.autoEncrypt` (default: true)
- Updated: vant.js, framework.js to use msg
- Deleted: lib/conversation.js, lib/ipc.js (no backwards compat)

### New: Network Layer

- Added `lib/network.js` (274 lines) - Network connectivity, retries, timeouts, latency
- Features: isOnline, checkOnline, getLatency, retry, withTimeout, fetch, fetchJson
- Integrated into: framework, vant, server, api, mcp, node, telegram
- Consolidated from: lib/utils.js (deleted)

### Refactor

- Deleted unused lib/utils.js (~180 lines, fully consolidated)

### New: Update class

- Unified lib/update.js (consolidating auto-update + update-check)
- Features: checkForUpdate, getLatestRelease, context auto-update, token tracking
- Integrated into: framework, vant, bin/summary, bin/update

### Webhooks

- Added vaf, qos, network protections to webhooks

## v0.8.6 - 2026-05-08

### Agent OS

**Runtime and Framework**

| Module | LOC | What It Does |
|--------|-----|-------------|
| `lib/runtime.js` | 369 | think, learn, act, remember, getTools |
| `lib/framework.js` | 116 | init, think, act, query brain |
| `lib/agents.js` | 173 | spawn, fork, delegate, join, emit |
| `lib/ipc.js` | 55 | Inter-agent messaging |

**Core Refactor (AI-first)**

| Module | Before | After | Δ |
|--------|--------|-------|---|
| `lib/brain.js` | 636 | 281 | -355 |
| `lib/islands.js` | 103 | 211 | +108 |
| `lib/search.js` | 285 | 240 | -45 |
| `lib/framework.js` | 1165 | 116 | -1049 |

**Legacy Stubs (backward compat)**

All deprecated modules now re-export from consolidated:

- `lib/env.js` → config
- `lib/entropy.js` → compression
- `lib/buffer.js` → pool
- `lib/storage.js` → pool
- `lib/audit-log.js` → audit
- `lib/metrics.js` → audit
- `lib/serializer.js` → compression
- `lib/horcrux.js` → stego
- `lib/rerank.js` → search (inline)
- `lib/search-hybrid.js` → search (inline)
- `lib/search-hyde.js` → search (inline)

### Features

1. **Agent Runtime**
   - `runtime.init({name, role})` - Initialize agent
   - `runtime.think(query)` - Query brain for context
   - `runtime.learn(key, content)` - Store to brain
   - `runtime.remember(key)` - Persist across sessions
   - `runtime.act(fn)` - Execute with locks

2. **Multi-Agent**
   - `agents.spawn({name, role})` - Create sub-agent
   - `agents.fork()` - Clone for parallel work
   - `agents.join(conversation)` - Shared context
   - `agents.emit(event, data)` - Signal other agents

3. **IPC**
   - `ipc.send(channel, message)` - Send to channel
   - `ipc.subscribe(channel, handler)` - Subscribe

### v0.8.5 - 2026-05-07

**Search Consolidation**

- `lib/search.js` - Query brain, rerank, hydrate merged
- `lib/rerank.js` - DEPRECATED → merged into search
- `lib/search-hybrid.js` - DEPRECATED → merged into search
- `lib/search-hyde.js` - DEPRECATED → merged into search

### v0.8.4 - 2026-05-06

**Brain + Islands**

- `lib/islands.js` - Lazy-loadable skill blocks
- Islands trigger on prompt keywords

### Earlier

See Git history for releases before v0.8.4.
