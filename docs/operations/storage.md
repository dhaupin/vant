---
version: 0.8.6
permalink: /operations/storage
layout: default
title: Storage Layer
nav_order: 48
---

# Storage Layer

The storage module (lib/storage.js) - Vant's brain storage abstraction.

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
const brain = Storage.get('brain');
```

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
```

## Brain Operations

Read from brain:

```javascript
// Get file content
const content = brain.get('learnings', 'lesson-1');

// Get identity
const identity = brain.getIdentity();
console.log(identity.name);  // "MyAgent"
```

Write to brain:

```javascript
// Write file
brain.write('learnings', 'lesson-1', '# New Learning\n\nContent here');

// Append to file
brain.append('lessons', 'default', '- New lesson\n');
```

### Get Version

Get brain version:

```javascript
console.log(brain.getVersion());
// { version: "0.8.6", updated: "2026-05-11" }
```

## File Operations

Atomic writes ensure data integrity:

```javascript
// Write goes through atomicWrite internally
brain.write('learnings', 'new', 'content');

// Read with error handling
const content = brain.read('learnings', 'new');
if (content.error) {
    console.log(content.error);
}
```

## Models Path

The default brain location:

```javascript
const brain = Storage.get('brain');
console.log(brain.modelsPath); // "models/private"
```

## GitHub Sync

Storage integrates with GitHub via connectors:

```javascript
const connectors = require('./lib/connectors');

// GitHub connector
const github = new connectors.github({
    token: process.env.GITHUB_TOKEN,
    repo: 'owner/repo'
});
```

See [Providers](integrations/providers) for all connectors.

## Islands

Storage includes island support:

```javascript
const islands = Storage.get('island');

// Get island manifest
const manifest = islands.getManifest();

// Load island
const data = islands.get('github');
```

See [Islands](essential/islands) for details.

## Vector Store

Store embeddings for semantic search:

```javascript
const vector = Storage.get('vector');

// Add embeddings
vector.add('doc-1', 'content text', [0.1, 0.2, 0.3]);

// Search
const results = vector.search('query text', { topK: 5 });
```

## Sandbox Integration

Storage respects sandbox permissions:

```javascript
// Read operation checks canRead
const content = brain.get('learnings', 'lesson-1');
// If !canRead, throws "Read permission required"
```

See [Sandbox](security/sandbox) for details.

---

## Configuration

Storage options:

```javascript
const storage = new Storage({
    path: 'models/private',     // brain location
    sync: true,             // auto-sync
    atomic: true,          // atomic writes
    sandbox: true          // enable checks
});
```

---

## Related

- [Brain](essential/brain) - Brain file structure
- [Islands](essential/islands) - Lazy brain components
- [Search](advanced/search) - Hybrid search
- [Providers](integrations/providers) - GitHub, GitLab, etc