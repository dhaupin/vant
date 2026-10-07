---
version: 0.8.6
permalink: /operations/storage
layout: default
title: Storage
nav_order: 52
---# Storage

The storage module (lib/storage.js) - Vant's brain storage abstraction
and the operations surface around it (statuses, stats, WAL, mirrors).
The factory-level API reference is [Storage](/vant/reference/storage).

## What

The storage layer handles all brain read/write operations:

- File system operations
- GitHub sync via connectors
- Atomic writes
- Brain version management
- Vector store integration
- Island storage

## Quick Start

Import storage:

```javascript
const Storage = require('vant').storage;
```

`vant.storage` is the lib/storage.js module itself. `Storage.get(type)`
returns factory instances; most APIs below take a `basePath` or use the
brain path by default.

## Getting Storage

Get different storage types:

```javascript
// Brain (primary)
const brain = Storage.get('brain');

// Island storage
const islands = Storage.get('island');

// Vector store
const vector = Storage.get('vector');

// State storage
const state = Storage.get('state');

// Also: 'file', 'config', 'schema', 'repos', 'remote'
```

## Brain Operations

BrainStorage keys files by (category, key):

```javascript
// Get file content
const content = brain.get('learnings', 'lesson-1');

// List a category
const files = brain.list('learnings');
```

Write to brain:

```javascript
// Write file (atomic)
brain.write('learnings', 'lesson-1', '# New Learning\n\nContent here');

// Append to file
brain.append('learnings', 'lesson-1', '- New lesson\n');
```

There is no `brain.getIdentity()` or `brain.getVersion()` on the
storage class - identity lives in the brain files themselves (read them
with `get('identity')`) and versioning is the CLI's (`vant load
--version`, brain.json's version field).

### Get Version

```javascript
const schema = Storage.get('schema');  // brain.json/_core.json handling
```

## File Operations

Atomic writes ensure data integrity:

```javascript
// Write goes through atomicWrite internally
brain.write('learnings', 'new', 'content');

// Read with error handling: sandbox denials return { error }
const content = brain.get('learnings', 'new');
if (content && content.error) {
    console.log(content.error);
}
```

## Models Path

The default brain location is the brain path (`models/private/<brain>`
under the multibrain layout); FileStorage instances take an explicit
`basePath` option.

## GitHub Sync

Sync is its own module - `lib/sync.js` with the provider connectors in
`lib/connectors/` (github, gitlab, bitbucket, gitea, selfhosted):

```javascript
const sync = require('./lib/sync');
await sync.pushAll({ commitMessage: 'Vant sync update' });
```

See [Multi-Provider RAID Sync](/vant/operations/sync) for the
multi-provider surface.

## Islands

Storage includes island support:

```javascript
const islands = Storage.get('island');

// Get island manifest
const manifest = islands.getManifest();
```

Note: `IslandStorage.getManifest()` is sync in the storage class; the
lib/islands.js module's `getManifest()` is async (use
`getManifestSync()` there). See [Islands](/vant/essential/islands).

## Vector Store

Store embeddings for semantic search:

```javascript
const vector = Storage.get('vector');

// Add an entry (id, text, metadata) - embedding is derived or delegated
vector.add('doc-1', 'content text', { title: 'Doc 1' });

// Search (topK defaults to 5)
const results = vector.search('query text', { topK: 5 });
```

The doc's old `vector.add(id, content, [0.1, 0.2, 0.3])` signature was
fiction: the third parameter is a metadata object, not a vector.

## Configuration

Storage options (FileStorage constructor):

```javascript
const { FileStorage } = require('./lib/storage');

const store = new FileStorage({
    basePath: 'models/private',       // store location
    encrypt: true,                    // or VANT_STORAGE_ENCRYPT=1
    wal: true,                        // write-ahead journal
    mirrors: ['/backup/path']         // passive replicas
});
```

There is no `new Storage({ path, sync, atomic, sandbox })` constructor -
`sandbox` integration is automatic (capability checks inside get/write,
not an option).

---

## Related

- [Brain](/vant/memory/brain) - Brain file structure
- [Islands](/vant/essential/islands) - Lazy brain components
- [Search](/vant/memory/search) - Hybrid search
- [Multi-Provider RAID Sync](/vant/operations/sync) - Provider connectors