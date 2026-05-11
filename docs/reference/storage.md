---
version: 0.8.6
permalink: /reference/storage
layout: default
title: Storage
nav_order: 84
---
# Storage (v0.8.6)

Unified storage abstraction layer for Vant.

---

## Overview

Storage provides a unified interface for all persistence in Vant:
- File system operations
- Brain/memory files
- Vector embeddings/databases
- State management
- Schema storage

### Design Principles

1. **Type-specific** - Each storage type has specialized methods
2. **Connector pattern** - External DBs via connectors (like providers/)
3. **GitHub ToS safe** - No auto-sync, opt-in only
4. **Atomic writes** - Safe file operations
5. **Lazy loading** - Connectors loaded on demand

---

## Architecture

```
Storage (abstract base)
├── FileStorage      (local file I/O)
├── BrainStorage    (brain/memory files)  
├── VectorStorage  (vector embeddings)
├── StateStorage   (state management)
├── ConfigStorage (configuration)
├── LockStorage   (file-based locks)
├── SchemaStorage (JSON schemas)
├── IslandStorage (brain islands)
│
└── connectors/   (external vector DBs)
    ├── pinecone.js
    ├── qdrant.js
    └── weaviate.js
```

---

## Usage

### Factory Access

```js
const Storage = require('./storage');

// Get storage by type
const files = Storage.get('file');
const brain = Storage.get('brain');
const vector = Storage.get('vector');
const state = Storage.get('state');
```

### File Storage

```js
const files = Storage.get('file');

// Read/write text
const content = files.read('/path/to/file.txt');
files.write('/path/to/file.txt', 'Hello world');

// Read/write JSON
const data = files.readJson('/path/to/data.json');
files.writeJson('/path/to/data.json', { key: 'value' });

// Exists/check
files.has('/path/to/file.txt');
files.delete('/path/to/file.txt');

// Search
files.list('/path/to/**/*.txt');
```

### Brain Storage

```js
const brain = Storage.get('brain');

// Get brain content
const content = brain.get('identity', 'lessons.md');
brain.write('identity', 'lessons.md', '# Lessons learnt');
brain.append('identity', 'lessons.md', '\n- New learning');

// Query brain
const results = await brain.query('what did I learn about X?');

// Check exists
brain.has('identity', 'lessons.md');
```

### Vector Storage

```js
const vector = Storage.get('vector');

// Add embedding
vector.add('doc_1', '_document text', { title: 'Doc 1', type: 'notes' });

// Search
const results = await vector.search('search query', { topK: 5 });

// With connector
const pgvector = Storage.get('vector', { connector: 'pinecone', apiKey: 'xxx' });
```

### State Storage

```js
const state = Storage.get('state');

// Get/set state
const current = state.get('current');
state.set('current', { mode: 'agent', agent: 'engineer' });

// Static state (persisted)
const staticData = state.getStatic('identity');
state.setStatic('identity', { name: 'Vant', version: '0.8.6' });

// Clear temp state
state.clearTemp();
```

### Config Storage

```js
const config = Storage.get('config');

// Get/set config
const value = config.get('features.autoSync');
config.set('features.autoSync', true);

// Get all
const all = config.getAll();
```

### Lock Storage

```js
const lock = Storage.get('lock');

// Acquire lock
const token = lock.acquire('resource_id', { ttl: 60000 });

// Check/renew
lock.has('resource_id');
lock.renew('resource_id', { ttl: 60000 });

// Release
lock.release('resource_id', token);
```

---

## Connectors (External Vector DBs)

### Location

`lib/storage/connectors/` - Same pattern as `lib/providers/`

### Connector Interface

```js
class VectorConnector {
    constructor(config = {}) {
        this.config = config;
    }
    
    async connect() { throw new Error('Not implemented'); }
    async add(id, text, metadata) { throw new Error('Not implemented'); }
    async search(query, options) { throw new Error('Not implemented'); }
    async delete(id) { throw new Error('Not implemented'); }
    async close() { throw new Error('Not implemented'); }
}
```

### Using Connectors

```js
// Direct connector
const pinecone = new (require('./storage/connectors/pinecone'))({ apiKey: 'xxx' });
await pinecone.add('id', 'text');
await pinecone.search('query');

// Via Storage factory
const vector = Storage.get('vector', { connector: 'pinecone', apiKey: 'xxx' });
```

### Built-in Connectors

| Connector | Status |
|-----------|--------|
| pinecone | TODO |
| qdrant | TODO |
| weaviate | TODO |
| local (default) | Built-in |

---

## GitHub ToS Protection

⚠️ **Important**: Vant is designed to work with GitHub. Some storage operations may violate GitHub Terms of Service if used as a database with auto-sync.

### Guidelines

1. **No auto-sync** - Always opt-in via config
2. **Warn in docs** - Document ToS risks
3. **Comment warnings** - Code comments about ToS

### Config Options

```js
// Opt-in to auto-sync (disabled by default)
const config = Storage.get('config');
config.set('storage.autoSync', false);  // Default: false

// Warn before enabling
// WARNING: Enabling auto-sync may violate GitHub ToS
```

### ToS Reference

See [GitHub Terms of Service](https://docs.github.com/en/github/site-policy/github-terms-for-additional-products-and-features#packages) for more info.

---

## Migration from v0.8.4

⚠️ This is a clean-slate refactor. No backward compatibility provided.

### Files Deleted

- `lib/brain.js` → Use `Storage.get('brain')`
- `lib/vector-store.js` → Use `Storage.get('vector')`
- `lib/repos.js` → Use `Storage.get('repos')` (or providers)
- `lib/state.js` → Use `Storage.get('state')`

### Migration Example

```js
// OLD (v0.8.4)
const brain = require('./brain');
const content = await brain.get('identity', 'lessons.md');

// NEW (v0.8.6)
const Storage = require('./storage');
const brain = Storage.get('brain');
const content = brain.get('identity', 'lessons.md');
```

---

## API Reference

### Storage.get(type, options)

Factory method to get storage instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | Storage type: 'file', 'brain', 'vector', 'state', 'config', 'lock', 'schema', 'island' |
| options | object | Connector config, etc |

Returns: Storage instance

### FileStorage

| Method | Description |
|--------|-------------|
| read(path) | Read file content |
| write(path, content) | Write file |
| readJson(path) | Read JSON file |
| writeJson(path, data) | Write JSON file |
| has(path) | Check file exists |
| delete(path) | Delete file |
| list(pattern) | List files by glob |

### BrainStorage

| Method | Description |
|--------|-------------|
| get(category, key) | Get brain content |
| write(category, key, content) | Write brain file |
| append(category, key, content) | Append to brain |
| has(category, key) | Check exists |
| query(query) | Query brain |
| list(category) | List brain files |

### VectorStorage

| Method | Description |
|--------|-------------|
| add(id, text, metadata) | Add embedding |
| search(query, options) | Search embeddings |
| delete(id) | Delete embedding |
| connect(connector) | Connect to external DB |

### StateStorage

| Method | Description |
|--------|-------------|
| get(key) | Get state |
| set(key, value) | Set state |
| getStatic(key) | Get static state |
| setStatic(key, value) | Set static state |
| getTemp(key) | Get temp state |
| setTemp(key, value) | Set temp state |
| clearTemp() | Clear temp state |

### ConfigStorage

| Method | Description |
|--------|-------------|
| get(key) | Get config value |
| set(key, value) | Set config value |
| getAll() | Get all config |
| save() | Save to disk |
| load() | Load from disk |

### LockStorage

| Method | Description |
|--------|-------------|
| acquire(id, options) | Acquire lock |
| has(id) | Check lock exists |
| renew(id, options) | Renew lock |
| release(id, token) | Release lock |

---

## Version

- v0.8.6