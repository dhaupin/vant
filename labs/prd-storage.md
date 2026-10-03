# Vant Storage Layer — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-19  
**Status:** Implemented (v0.8.6+)

---

## 1. Overview

The Vant Storage layer provides a **unified multi-backend storage abstraction** with a connector pattern, atomic writes, format-agnostic persistence, and defense-in-depth security. It serves as the persistence backbone for brains, vectors, config, locks, schemas, islands, and repos.

### Design Principles
- **Unified interface**: Single factory `getStorage(type)` for all backends
- **Connector pattern**: Pluggable backends (local, remote, in-memory)
- **Atomic writes**: Temp file + rename with `O_NOFOLLOW|O_EXCL` for symlink protection
- **Format agnostic**: Auto-detect YAML, JSON, MD, TXT via `format.js`
- **Secure by default**: VAF path validation, prototype pollution sanitization, deny-by-default sandbox
- **Event-driven**: All operations emit events for reactivity
- **Stack support**: Multi-brain isolation with cross-brain search/read

### Storage Types
| Type | Purpose | Backend | Format Support |
|------|---------|---------|----------------|
| `file` | Generic file ops | Local FS | All (via format.js) |
| `brain` | Brain-specific | Local FS (models/) | All with auto-ext |
| `vector` | Embeddings/vectors | Local Map + connectors | JSON/embedding |
| `config` | JSON config (no require RCE) | Local FS | JSON (module.exports) |
| `state` | Layered state (private>public) | Local FS | JSON |
| `lock` | Distributed locks | Local FS | JSON |
| `schema` | JSON schemas | Local FS | JSON |
| `island` | Brain modules | Local FS | JSON |
| `repos` | Git repo registry | Local FS | JSON |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVICES                                  │
│  brain │ islands │ agents │ mcp │ sync │ search │ schema       │
└─────────────────────┬───────────────────────────────────────────┘
                      │ storage.get('type')
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STORAGE FACTORY                              │
│  getStorage(type, options) → singleton instance                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┬─────────────┐
        ▼             ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
│  FileStorage  │ │BrainStorage│ │VectorStorage│ │ConfigStorage│ ... │
│  (generic)    │ │(brains)    │ │(embeddings) │ │(JSON)    │ │          │
└───────┬───────┘ └─────┬─────┘ └──────┬─────┘ └────┬─────┘ └──────────┘
        │               │              │            │
        │               │              │            │
        └───────────────┴──────────────┴────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    SECURITY CHAIN     │
              │  sandbox → vaf → qos  │
              │      → escrow         │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │      FILE SYSTEM      │
              │  (atomicWrite, O_EXCL │
              │   O_NOFOLLOW, SHA256) │
              └───────────────────────┘
```

### Core Modules
- **`lib/storage.js`** — Factory, all storage classes, stack functions, atomic utilities
- **`lib/format.js`** — Format detection, parsing, serialization (YAML/JSON/MD/TXT)
- **`lib/vaf.js`** — Input validation, path traversal, prototype pollution sanitization
- **`lib/brain.js`** — Brain router, paths, stack management
- **`lib/sudo.js`** — Capability escalation for write operations
- **`lib/sandbox.js`** — Deny-by-default capability gating

### fs→storage Migration Standard (v0.9.0-axolotl)

All modules MUST route brain/models file I/O through FileStorage, not raw fs.
The validated pattern (apply to any module still touching fs — see the
R-1..R-6 roadmap in `labs/TASKS.md` for the remaining queue):

1. **One shared store per module**, `new Storage.FileStorage({ basePath:
   <models root> })`, lazily constructed (storage.js requires brain.js at its
   own module load — never construct stores at module-load time).
2. **Store-relative paths** via `path.relative(modelsRoot, absPath)`.
3. **Contracts:** `read()` → string|null (null = missing), `has()` → bool,
   `write()` = atomic + parent mkdirs + containment + VAF, `delete()` → bool.
4. **Per-call path resolution** for anything under the CURRENT brain
   (`getBrainPath()`/`getPublicPath()` resolve per call; a store keyed/frozen
   at module load breaks `pushBrain()` — see succession.js fix).
5. **Safe-charset validation** for ANY external name that becomes a path
   segment (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` + no `..` — islands/skills
   pattern).
6. **Enumeration stays on fs** (readdir/stat) — storage.list is
   pattern-glob only; keep paths anchored to models roots, never caller input.
7. **Binary/contained exceptions:** artifact dirs outside models (backups,
   stego payloads) use contained+validated fs, not FileStorage — document the
   choice at the call site.
8. **Verify:** full `test/*.test.js` loop + `node test/ci.js` per commit, one
   module per commit, `axolotl:` prefix.

---

## 3. Storage Types

### 3.1 FileStorage — Generic File Operations
**File:** `lib/storage.js:258-491`

Generic file operations with path containment, VAF validation, and atomic writes.

```javascript
const Storage = require('./storage');
const file = Storage.get('file', { basePath: '/workspace/data' });

// Read with VAF path validation
const content = file.read('notes/todo.md');  // Blocks ../../etc/passwd

// Write with atomic safety + format auto-serialization
file.write('config/app.json', { port: 3000 }, { format: 'json' });
file.write('notes/todo.yaml', { tasks: ['a', 'b'] }, { format: 'yaml' });

// JSON helpers (auto-sanitized)
file.readJson('package.json');
file.writeJson('config/app.json', { port: 3000 });

// Existence & listing
file.has('notes/todo.md');
file.list('notes/*.md');

// Delete (capability gated)
file.delete('old.txt');
```

**Security Features:**
- Path containment check (`_checkContainment`) — prevents directory escape
- Symlink detection (`_checkSymlink`) — blocks symlink attacks
- VAF path traversal check (`vaf.checkPathTraversal`) — blocks `../`, absolute paths
- Prototype pollution sanitization on object writes (`vaf.sanitizeObject`)
- Capability gating via `_checkReadSafe()` / `_checkWriteSafe()` (v0.9.0-axolotl)

### 3.2 BrainStorage — Brain-Specific Storage
**File:** `lib/storage.js:494-685`

Brain-aware storage with category/key structure, format detection, and brain-friendly APIs.

```javascript
const brain = Storage.get('brain');

// Get brain file (category = directory, key = filename)
const identity = brain.get('vant', 'identity.md');  // models/private/vant/identity.md

// List categories (brains)
const brains = brain.get();  // ['vant', 'nova', 'public']

// Write with auto-extension based on format
brain.write('vant', 'lessons', { learned: 'new thing' }, { format: 'md' });
// → models/private/vant/lessons.md

brain.write('vant', 'config', { version: '1.0' }, { format: 'json' });
// → models/private/vant/config.json

// Append to existing
brain.append('vant', 'log.md', '\nNew entry');

// Query (text search across all brain files)
const results = brain.query('error handling');
// → [{ category, file, content: '...' }]

// Brain-friendly APIs (block external paths)
brain.brainHas('identity');  // true/false - no path traversal
brain.brainRead('identity'); // content - blocks paths with / or \
brain.brainList('vant');     // ['identity.md', 'lessons.md', ...]
```

**Key Features:**
- Category/key structure maps to `basePath/category/key`
- Auto-detects format from content (v0.8.6 format transformer)
- Extension auto-added: `.md` (default), `.json`, `.yaml`, `.txt`
- Path containment enforced in `_getFilePath()`
- Events emitted: `storage:loaded`, `storage:saved`, `storage:miss`, `storage:checked`

### 3.3 VectorStorage — Embeddings & Semantic Search
**File:** `lib/storage.js:688-848`

Vector storage with pluggable connectors, TF-IDF/transformer embeddings, cosine similarity.

```javascript
const vector = Storage.get('vector', { embedder: 'tfidf' });

// Set embedder (tfidf default, 'transformers' if installed)
vector.setEmbedder('tfidf');

// Add documents (legacy sync - hash fallback)
vector.add('doc1', 'Vant is a memory system', { tags: ['memory'] });

// Add with semantic embeddings (async, recommended)
await vector.addAsync('doc2', 'Storage layer handles persistence', { type: 'storage' });

// Batch add
await vector.addBulk([
  { id: 'a', text: '...', metadata: {} },
  { id: 'b', text: '...', metadata: {} }
]);

// Legacy hash-based search
const results = vector.search('memory system', { topK: 5 });

// Semantic search (async, recommended)
const results = await vector.searchAsync('persistence layer', { topK: 5 });

// Delete
vector.delete('doc1');

// Custom connector (e.g., Pinecone, Weaviate, Qdrant)
vector.connect({
  addAsync: async (id, text, meta) => { /* ... */ },
  search: async (query, opts) => { /* ... */ },
  delete: async (id) => { /* ... */ }
});
```

**Embedding Pipeline:**
1. Text → `embed.generate()` (TF-IDF by default, swappable)
2. Vector stored with metadata
3. Cosine similarity for search
4. Legacy hash fallback if embed module fails

### 3.4 ConfigStorage — JSON Config (No require RCE)
**File:** `lib/storage.js:961-1037`

Safe JSON config loading without `require()` — prevents RCE from malicious config files.

```javascript
const config = Storage.get('config', { filePath: 'vant.config.js' });

// Get nested values
config.get('storage.autoSync');    // false
config.get('github.token');        // null
config.get('features.experimental'); // undefined

// Set nested values (auto-sanitized)
config.set('storage.autoSync', true);
config.set('github.token', 'ghp_xxx');

// Get all
const all = config.getAll();

// Save (writes as module.exports = {...})
config.save();

// Load/reload
config.load();
```

**Security:**
- Parses `module.exports = {...}` without `require()`
- Falls back to `JSON.parse()`
- Prototype pollution sanitization on `set()`
- Atomic write via `atomicWrite()`

### 3.5 StateStorage — Layered State (Private Overrides Public)
**File:** `lib/storage.js:852-958`

Three-layer state with private (agent brain) overriding public (OSS templates).

```javascript
const state = Storage.get('state');

// Current session state (private)
state.setCurrent('task', 'review-prd');
state.getCurrent('task');  // 'review-prd'

// Object form
state.setCurrent({ task: 'review', phase: 'writing' });

// Static config (persistent across sessions)
state.setStatic('preferences', { theme: 'dark' });
state.getStatic('preferences'); // { theme: 'dark' }

// Temp state (cleared on clearTemp)
state.setTemp('cache', { data: '...' });
state.clearTemp();

// Summary
state.getSummary(); // "static={...},current={...}"
```

**Layered Read:**
1. Private path: `models/private/.state.json` (highest priority)
2. Public path: `models/public/.state.json` (fallback)
3. Default: `{ static: {}, current: {}, temp: {} }`

### 3.6 LockStorage — Distributed Locks
**File:** `lib/storage.js:1040-1115`

TTL-based locks with UUID tokens for distributed coordination.

```javascript
const locks = Storage.get('lock', { lockDir: '.locks' });

// Acquire lock (returns token)
const token = locks.acquire('deploy', { ttl: 60000 }); // 1 min

// Check if held
locks.has('deploy'); // true/false

// Renew
locks.renew('deploy', { ttl: 60000 });

// Release (requires token)
locks.release('deploy', token);
```

**Security:** Token sanitized via `vaf.sanitizeObject()`, atomic JSON write.

### 3.7 SchemaStorage — JSON Schema Registry
**File:** `lib/storage.js:1118-1154`

```javascript
const schema = Storage.get('schema', { schemaDir: 'schema' });

schema.set('workflow', { type: 'object', properties: { intent: { type: 'string' } } });
schema.get('workflow');
schema.has('workflow');
schema.list(); // ['workflow', 'island', ...]
```

### 3.8 IslandStorage — Brain Module Persistence
**File:** `lib/storage.js:1157-1204`

```javascript
const islands = Storage.get('island');

// Manifest management
const manifest = islands.getManifest();  // { version, islands: {}, loaded: [], hydrated: [] }
islands.saveManifest({ ...manifest, islands: { github: { enabled: true } } });

// Island data
islands.set('github', { repos: ['vant'], token: 'xxx' });
islands.get('github');
islands.has('github');
```

### 3.9 ReposStorage — Git Repository Registry
**File:** `lib/storage.js:1207-1290`

```javascript
const repos = Storage.get('repos');

repos.register('vant', 'https://github.com/dhaupin/vant', { branch: 'main' });
await repos.mount('vant');    // Adds to mounted[]
repos.unmount('vant');

await repos.pull();           // Requires config.storage.autoSync=true
repos.list();                 // ['vant']
repos.getMounted();           // ['vant']
```

**GitHub ToS Warning:** Auto-sync disabled by default; requires explicit opt-in.

---

## 4. Atomic Writes

**Implementation:** `lib/storage.js:216-240`

Atomic writes use temp file + rename with `O_NOFOLLOW|O_EXCL` for symlink protection.

```javascript
function atomicWrite(filePath, content) {
    _checkWriteSync(null, null);  // Capability gate
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW
    // - O_EXCL + O_CREAT: fail if file exists (including symlinks)
    // - O_NOFOLLOW: fail if path is a symlink (ELOOP on Linux)
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | 
                  fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
    let fd;
    try {
        fd = fs.openSync(filePath, flags, 0o600);
        fs.writeSync(fd, content, 0, 'utf8');
        fs.closeSync(fd);
    } catch (e) {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
        if (e.code === 'EEXIST' || e.code === 'ELOOP') {
            throw new errors.Error('Security: Symlink or existing file detected', 
                { code: errors.CODES.SECURITY_SYMLINK_ATTACK, retryable: false });
        }
        throw e;
    }
}
```

### Why This Matters
| Attack | Protection |
|--------|------------|
| Symlink to `/etc/passwd` | `O_NOFOLLOW` returns `ELOOP` |
| Race condition (TOCTOU) | `O_EXCL` fails if exists |
| Hardlink escape | `O_NOFOLLOW` + containment check |
| Partial writes | Single `writeSync` + close |

### Usage in Storage Classes
All write operations route through `atomicWrite()`:
- `FileStorage.write()` → `atomicWrite()`
- `BrainStorage.write()` → `atomicWrite()`
- `ConfigStorage.save()` → `atomicWrite()`
- `LockStorage.acquire()` → `writeJson()` → `atomicWrite()`
- `SchemaStorage.set()` → `writeJson()` → `atomicWrite()`
- `IslandStorage.set()` → `writeJson()` → `atomicWrite()`
- `ReposStorage._save()` → `writeJson()` → `atomicWrite()`

---

## 5. Checksums

### Per-File SHA256
Checksums computed on-demand for integrity verification.

```javascript
const crypto = require('crypto');
const content = fs.readFileSync(filePath, 'utf8');
const checksum = crypto.createHash('sha256').update(content).digest('hex');
```

### Manifest Hash (Transform/Horcrux)
Used in brain transformer pipeline for content-addressable storage.

```javascript
// In brain.js transform pipeline (v0.8.6)
transform('load', async (brain) => {
    const formatResult = format.parse(content, { validate: false });
    if (formatResult.data && !formatResult.error) {
        return {
            ...brain,
            parsed: formatResult.data,
            format: formatResult.format,
            checksum: crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
        };
    }
});
```

### Vector Storage Checksums
Vector embeddings include content hash for deduplication.

```javascript
_hashToVector(text) {
    const hash = crypto.createHash('sha256').update(text).digest();
    const vec = [];
    for (let i = 0; i < 128; i++) {
        vec.push(hash[i % hash.length] / 255);
    }
    return vec;
}
```

---

## 6. Security

### 6.1 VAF Path Validation
**File:** `lib/vaf.js:385-437`

All file operations pass through `vaf.checkPathTraversal()`:

```javascript
function checkPathTraversal(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return {blocked: false};
    if (inputPath.includes('\0')) return {blocked: true, reason: 'Null byte injection'};
    
    const normalized = path.normalize(inputPath);
    
    // Block sensitive system paths
    const blockedPrefixes = ['/etc/', '/usr/', '/bin/', '/sbin/', '/var/', '/root/',
        '/home/', '/tmp/', '/opt/', '/boot/', '/dev/', '/sys/', '/proc/', '/snap/'];
    for (const prefix of blockedPrefixes) {
        if (normalized.startsWith(prefix)) return {blocked: true, reason: 'Sensitive system path blocked'};
    }
    
    // Block Windows absolute paths
    if (normalized.match(/^[a-z]:[/\\]/i) || normalized.match(/^\\\\/)) {
        return {blocked: true, reason: 'Windows absolute path blocked'};
    }
    
    // Block home expansion
    if (normalized.includes('~') || normalized.includes('$HOME') || normalized.includes('$USER')) {
        return {blocked: true, reason: 'Home directory expansion blocked'};
    }
    
    // Block traversal
    if (normalized.includes('..')) return {blocked: true, reason: 'Path traversal detected'};
    
    // Block long paths
    if (inputPath.length > CONFIG.MAX_PATH_LENGTH) return {blocked: true, reason: 'Path too long'};
    
    return {blocked: false};
}
```

### 6.2 Prototype Pollution Sanitization
**File:** `lib/vaf.js:1419-1443`

All object writes sanitized via `vaf.sanitizeObject()`:

```javascript
function sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    const isArray = Array.isArray(obj);
    const sanitized = isArray ? [] : Object.create(null);  // NULL PROTOTYPE

    for (const key of Object.keys(obj)) {
        if (dangerousKeys.includes(key)) continue;
        const val = obj[key];
        if (val && typeof val === 'string' && dangerousKeys.includes(val)) continue;
        if (val && typeof val === 'object') {
            sanitized[key] = sanitizeObject(val);
        } else {
            sanitized[key] = val;
        }
    }
    return deepFreeze(sanitized);  // Immutable
}
```

**Applied in:**
- `FileStorage.write()` / `writeJson()` → `vaf.sanitizeObject(content)`
- `BrainStorage.write()` → `vaf.sanitizeObject(content)`
- `ConfigStorage.set()` → `vaf.sanitizeObject(value)`
- `StateStorage.setCurrent/Static()` → `_sanitizeObject()`
- `LockStorage.acquire()` → `vaf.sanitizeObject(data)`
- `SchemaStorage.set()` → `vaf.sanitizeObject(schema)`
- `IslandStorage.set/saveManifest()` → `vaf.sanitizeObject(data)`
- `ReposStorage.register()` → `vaf.sanitizeObject(repoConfig)`
- `format.parse()` → `vaf.sanitizeObject(data)` after JSON/YAML parse

### 6.3 Deny-by-Default Sandbox
**File:** `lib/storage.js:152-201`

v0.9.0-axolotl introduces safe-by-default capability gating:

```javascript
// Capture default sandbox stub (deny-by-default)
let _defaultSandboxRead = null;
let _defaultSandboxWrite = null;
function _captureDefaultSandbox() {
    if (_defaultSandboxRead !== null) return;
    const sandbox = _getSandbox();
    _defaultSandboxRead = sandbox?.canRead;
    _defaultSandboxWrite = sandbox?.canWrite;
}

// Safe read: allows if sandbox is default stub, blocks if explicitly configured
function _checkReadSafe() {
    _captureDefaultSandbox();
    const sandbox = _getSandbox();
    if (!sandbox || typeof sandbox.canRead !== 'function') return;
    if (sandbox.canRead === _defaultSandboxRead) {
        if (!_warnedDefaultRead) {
            _warnedDefaultRead = true;
            console.warn('[storage] Sandbox not configured; storage.read allows by default. ' +
                'Call sandbox.create({ canRead: false }) to lock down.');
        }
        return;  // Allow by default
    }
    _checkReadSync(null, null);  // Real sandbox - enforce
}

// Safe write: same pattern
function _checkWriteSafe() {
    _captureDefaultSandbox();
    const sandbox = _getSandbox();
    if (!sandbox || typeof sandbox.canWrite !== 'function') return;
    if (sandbox.canWrite === _defaultSandboxWrite) {
        if (!_warnedDefaultWrite) {
            _warnedDefaultWrite = true;
            console.warn('[storage] Sandbox not configured; storage.write allows by default. ' +
                'Call sandbox.create({ canWrite: false }) to lock down.');
        }
        return;
    }
    _checkWriteSync(null, null);
}
```

**Behavior:**
| Sandbox State | Read | Write |
|---------------|------|-------|
| Not configured (default stub) | ✅ Allow + warn | ✅ Allow + warn |
| Explicit `canRead: false` | ❌ Block | ✅ Allow |
| Explicit `canWrite: false` | ✅ Allow | ❌ Block |
| Explicit both false | ❌ Block | ❌ Block |

### 6.4 Sudo Escalation for Write Operations
**File:** `lib/storage.js:102-118`

Write operations escalate via sudo when sandbox denies:

```javascript
async function _checkWrite(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && typeof sandbox.can === 'function') {
        if (!sandbox.can('canWrite')) {
            const taskId = _getTaskId();
            if (taskId && sudo && sudo.can) {
                if (sudo.can(taskId, 'write')) return;
                await sudo.escalate(taskId, 'write', { 
                    service: 'storage', 
                    reason: 'Write operation requires write scope' 
                });
                return;
            }
            throw new errors.Error('Write permission required', 
                { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
        }
    }
}
```

---

## 7. Stack Support — Multi-Brain Storage Isolation

**File:** `lib/storage.js:1345-1485`

Cross-brain operations via brain stack (private → public → remote).

```javascript
const Storage = require('./storage');

// List files across ALL brains in stack
const allFiles = Storage.listStack('*.md');
// → [{ path, brain: 'vant' }, { path, brain: 'public' }, ...]

// Read from any brain in stack (first match wins)
const content = Storage.readStack('identity.md');
// Tries: vant/identity.md → public/identity.md → remote/identity.md

// Read from specific brain
const content = Storage.readStack('identity.md', { brain: 'vant' });

// Check existence across stack
const result = Storage.existsStack('config.json');
// → { exists: true, brain: 'vant' }

// Get stats across stack
const stats = Storage.getStackStats();
// → { source: 'stack', brains: ['vant', 'public'], totalFiles: 42, 
//      byBrain: { vant: { path: '...', files: 20 }, public: { path: '...', files: 22 } } }
```

### Implementation
```javascript
function listStack(pattern = '*') {
    const brain = require('./brain');
    const stack = brain.getStack();  // ['vant', 'public', 'remote']
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);  // Switch context
            const files = getStorage('file').list(pattern);
            if (Array.isArray(files)) {
                files.forEach(f => results.push({ ...f, brain: brainName }));
            }
        } catch (e) { /* skip failed brain */ }
        finally { brain.removeBrain(); }
    }
    return results;
}
```

---

## 8. API Reference

### Factory
```javascript
const Storage = require('./storage');

// Get storage instance (singleton per type+options)
Storage.get('file', { basePath: '/data' });
Storage.get('brain');
Storage.get('vector', { embedder: 'tfidf' });
Storage.get('config', { filePath: 'vant.config.js' });
Storage.get('state');
Storage.get('lock', { lockDir: '.locks' });
Storage.get('schema', { schemaDir: 'schema' });
Storage.get('island');
Storage.get('repos', { reposDir: 'models/repos' });
```

### Convenience Shortcuts (FileStorage)
```javascript
Storage.read(path);           // FileStorage.read()
Storage.write(path, data);    // FileStorage.write()
Storage.delete(path);         // FileStorage.delete()
Storage.has(path);            // FileStorage.has()
Storage.list(pattern);        // FileStorage.list()

// Atomic utilities
Storage.atomicWrite(filePath, content);
Storage.writeJson(filePath, data);
Storage.readJson(filePath);
```

### Pipeline-Backed Variants (v0.9.0-axolotl)
Full security chain: sandbox → vaf → qos → escrow

```javascript
const file = Storage.get('file', { basePath: '/data' });

// Async, pipeline-secured
await file.readSecured('notes.md');
await file.writeSecured('notes.md', 'content');
await file.deleteSecured('notes.md');
await file.listSecured('*.md');
```

### Status & Framework Interface
```javascript
Storage.version;                    // '0.8.6'
Storage.getLayerStatus();           // { name: 'Storage', type: 'storage', version, enabled: true }
Storage.isOperationAllowed();       // { allowed: true }
Storage.getStatus();                // { enabled: true }
```

### Multibrain Stack
```javascript
Storage.listStack(pattern);
Storage.readStack(path, options);
Storage.existsStack(path);
Storage.getStackStats();
```

---

## 9. Configuration

### storage.ini / config.ini Settings

VAF loads config from `config` module (vant.config.js or config.ini):

```ini
# VAF Configuration (affects storage validation)
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_HOUR=1000
MAX_BURST=10
MAX_STRING_LENGTH=100000
MAX_DEPTH=5
MAX_ARRAY_LENGTH=1000
MAX_PATH_LENGTH=4096
BLOCK_PATH_TRAVERSAL=true
AUDIT_LOG=true
AUDIT_FILE=.audit.log
```

```javascript
// Runtime config via VAF
const vaf = require('./vaf');
vaf.setConfig({ MAX_STRING_LENGTH: 50000, BLOCK_PATH_TRAVERSAL: true });
vaf.getConfig('MAX_STRING_LENGTH');
vaf.reloadConfig();  // Reload from config module
```

### Storage-Specific Config
```javascript
// ConfigStorage loads from vant.config.js
const config = Storage.get('config');
config.get('storage.autoSync');     // false (default)
config.get('github.token');         // null
config.set('storage.autoSync', true);  // Enable repo auto-sync
```

### Brain Path Configuration
```javascript
const brain = require('./brain');
brain.getBrainPath();    // 'models/private' (runtime)
brain.getPublicPath();   // 'models/public' (OS template)
brain.setMode('dual');   // 'dual' | 'public' | 'private' | 'remote'
```

---

## 10. Event Emissions

All storage operations emit events via `event.js` PubSub:

| Event | Payload |
|-------|---------|
| `storage:loaded` | `{ category, key, path, size, timestamp }` |
| `storage:saved` | `{ category, key, path, size, timestamp }` |
| `storage:deleted` | `{ path, timestamp }` |
| `storage:miss` | `{ category, key }` |
| `storage:checked` | `{ category, key, exists: true }` |
| `format:parsed` | `{ format, error, timestamp }` |
| `vaf:blocked` | `{ reason, type: 'path'|'content', timestamp }` |

```javascript
const event = require('./event');
event.on('storage:saved', (data) => {
    console.log('Saved:', data.category, data.key, 'size:', data.size);
});
```

---

## 11. Testing

```bash
# Run storage tests
node test/storage.test.js

# Run format tests
node test/format.test.js

# Run VAF tests
node test/vaf.test.js

# Run brain tests (includes storage integration)
node test/brain.test.js
```

### Test Coverage (v0.8.6+)
- Storage factory & all types: ✅
- Atomic writes & symlink protection: ✅
- Path traversal blocking: ✅
- Prototype pollution sanitization: ✅
- Format detection/parse/serialize: ✅
- VAF content/path validation: ✅
- Stack operations: ✅
- Pipeline-secured variants: ✅
- Safe-by-default capability gating: ✅

---

## 12. Future Enhancements (P3+)

- [x] **Remote connectors**: S3, GCS, Azure Blob backends for FileStorage — DONE (axolotl `d22379b`+`b3d7f73`+`4597044`, relocated per dhaupin option B): own S3-API client `lib/connectors/s3.js` (SigV4 + global fetch, zero deps; registered as `connectors.s3(config)` in the connectors index) — ONE implementation covers S3, Cloudflare R2, MinIO, Backblaze B2 via provider presets (GCS/Azure speak non-S3 APIs, deliberately out of scope); `RemoteStorage` store via `getStorage('remote', {...})` — shared B-2 capability gate, key hardening (absolute/backslash/traversal refused pre-network, incl. raw bypass), recursive-by-default list (shallow parity opt-in), prefix round-trip mapping, `pushFrom`/`pullTo` sync helpers, per-store metrics at `remote://` pseudo basePath, DI client injection for offline tests; CLI `vant s3` (status/test/ls/push/pull, --dry-run). NOTE: `lib/remote.js` is the git-providers registry; `connectors/cloudflare.js` r2* ops now DELEGATE to this client (axolotl `9fd4a51`: R2's native S3 endpoint, SigV4 access keys `CF_R2_*`, new `r2Delete`, shared `_parseListXml`; the connector's old control-plane r2 impl was DOA — broken `./`-sibling requires crashed every path — and is gone). Tests: `test/remote.test.js` 10/10 (offline incl. SigV4 known-answer), `test/remote-storage.test.js` 13/13, `test/remote-cli.test.js` 6/6, `test/cloudflare-r2.test.js` 9/9.
- [x] **Encryption at rest**: Optional AES-256 via `encrypt.js` integration — DONE (axolotl `e91111b`): FileStorage `encrypt: true` + `encryptKey`/`VANT_STORAGE_KEY`, `vant-enc:v1:` prefix, mixed stores OK
- [x] **Compression**: Transparent gzip for large blobs — DONE (axolotl `d4990d8`): `compressAbove`/`VANT_STORAGE_COMPRESS_ABOVE`, `vant-gz:v1:` prefix, compress→encrypt order
- [x] **WAL/Journal**: Write-ahead log for crash recovery — DONE (axolotl `5d22fae`): `lib/wal.js` JSONL journal + fsync-style flush, replay/verify/truncate API; FileStorage recovers uncommitted ops on open; CLI `vant wal` (status/replay/verify/truncate). Tests: `test/wal.test.js` incl. simulated crash-recovery fixtures.
- [x] **Replication**: Multi-node sync — DONE (axolotl `4794d49`, mirror-style not Raft/CRDT): primary→mirror replication via FileStorage `mirror` config (push-on-write + manual `replicate()`); CLI `vant mirror <target>` (push/status). Tests: `test/storage-mirror.test.js`.
- [x] **Metrics**: Prometheus exporter for storage ops — DONE (axolotl `59325b8` + `3fc1d3d`): shared in-process registry `lib/metrics.js` (counters/gauges/histograms, Prometheus text exposition `vant metrics --prom`); storage ops instrumented (op/outcome counters, duration histograms) + CLI storage section. Tests: `test/metrics.test.js`, `test/storage-metrics.test.js`.
- [x] **Migration tool**: Schema/layout versioning for brain format changes — DONE (axolotl): `lib/migrations.js` + `vant migrate` CLI. Content-based detection (never trusts the marker alone), ordered idempotent steps (orgchart brain-scope, tmp-space re-anchor, dropfile relocation), dryRun, `models/private/.layout-version.json` marker written only after success, all moves through FileStorage (security chain). Tests: `test/migrations.test.js` 8/8 incl. real fixture layouts.
- [x] **Backup/Restore**: Point-in-time snapshots — DONE (axolotl): FileStorage `snapshot(label)` / `listSnapshots()` / `restoreSnapshot(id)` / `deleteSnapshot(id)`. Tree copies live in `<basePath>/.snapshots/<id>/data` + manifest; every file moves through the secured read/write chain (hand-edited manifests with traversal paths are refused up front); `.snapshots/` excluded from capture and restore-removal; count capped via `maxSnapshots`/`VANT_STORAGE_MAX_SNAPSHOTS` (default 20, oldest pruned); encrypted stores round-trip through the codec. CLI: `vant storage snapshot|snapshots|restore|unsnapshot` against the models root. Tests: `test/snapshots.test.js` 9/9.

---

## 13. References

- **Implementation**: `lib/storage.js`
- **Format Handler**: `lib/format.js`
- **Security (VAF)**: `lib/vaf.js`
- **Brain Router**: `lib/brain.js`
- **Sudo Escalation**: `lib/sudo.js`
- **Sandbox**: `lib/sandbox.js`
- **Tests**: `test/storage.test.js`, `test/format.test.js`, `test/vaf.test.js`
- **Brain Design Doc**: `docs/architecture/brain.md`
- **Security Audit**: `AUDIT_FINDINGS.md`

(End of file - ~400 lines)