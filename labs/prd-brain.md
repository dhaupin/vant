# Vant Brain Architecture — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-19  
**Status:** Implemented (v0.8.6+)

---

## 1. Overview

The Vant Brain system provides a **persistent memory system** for AI agents. When an agent "wakes up" (starts a session), it inherits everything previous agents wrote. When it finishes, it writes what it learned so future agents know. Think of it as: **your soul that reincarnates with full memories.**

### Design Principles
- **Persistent Memory**: Brain state survives session restarts via `models/private/` and `models/public/`
- **Multi-Brain Stack**: Layer multiple brains (public OS template + private runtime + remote)
- **Privacy Modes**: Four modes control read/write behavior (`dual` | `public` | `private` | `remote`)
- **Format Agnostic**: Supports `.md`, `.json`, `.yaml`, `.yml`, `.txt`, `.ini` via unified `format.js`
- **Islands as Modules**: Lazy-loadable brain components (static corpus vs dynamic storage)
- **Security First**: Sandbox → VAF → QoS → Escrow middleware chain on all operations
- **Sync Integration**: Push to all providers, pull from any, 3-way merge, rebase stale providers

### Core Concepts
| Concept | Description |
|---------|-------------|
| **Brain** | A directory of files (`identity.md`, `goals.md`, `lessons.md`, etc.) |
| **Corpus** | All brain files loaded as a merged array |
| **Stack** | Ordered list of brains checked top-to-bottom |
| **Mode** | Controls which sources are read/written |
| **Island** | Lazy-loadable brain module (static or dynamic) |
| **Neurons** | Synaptic weights tracking brain access patterns |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVICES                                  │
│  agents │ sync │ mcp │ islands │ geometry │ evolution │ stego  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ brain.load(), brain.read(), brain.write()
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BRAIN ROUTER (lib/brain.js)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Registry    │  │ Pipeline    │  │ Hooks                   │  │
│  │ (handlers)  │  │ (middleware)│  │ (beforeLoad, afterLoad) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Aliases     │  │ Transformers│  │ Cache / Watcher         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Security Chain: Sandbox → VAF → QoS → Escrow
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FORMAT LAYER (lib/format.js)               │
│  detect() │ parse() │ serialize() │ loadFile() │ saveFile()    │
│  listFiles() │ getBrainName() │ prepare() (chained ops)        │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Multi-format: .md .json .yaml .yml .txt .ini
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                              │
│  models/public/  (OS template, read-only in dual mode)          │
│  models/private/ (runtime, agent writes here)                   │
│  storage/ (islands, sync, geometry, stego backups)              │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| File | Responsibility |
|------|----------------|
| `lib/brain.js` | Router, registry, pipeline, hooks, multi-brain stack, modes, cache |
| `lib/format.js` | Format detection, parsing, serialization, file I/O, validators |
| `lib/islands.js` | Static (corpus) and lazy (storage/runtime) brain modules |
| `lib/sync.js` | Push/pull/rebase, 3-way merge, provider management |
| `lib/geometry.js` | NSC9 quasicrystal addressing per brain |
| `lib/evolution.js` | Session tracking, vertical learning across sessions |

---

## 3. Modes

Brain operates in four modes controlled by `brain.setMode()` and `brain.getMode()`:

### Mode Behavior

| Mode | Read Behavior | Write Behavior | Use Case |
|------|---------------|----------------|----------|
| `dual` (default) | Public first, then private (private overrides) | Private only | Normal operation |
| `public` | Public only | Public | OS template distribution |
| `private` | Private only | Private | Isolated agent work |
| `remote` | Remote HTTP endpoint | Not supported | Distributed brain |

### Mode Resolution Logic (`resolveBrainSource()`)

```javascript
// lib/brain.js:1604-1696
async function resolveBrainSource(name, mode, options = {}) {
    // mode === 'public'  → models/public/{brain}/{name}.{ext}
    // mode === 'private' → models/private/{currentBrain}/{name}.{ext}
    // mode === 'remote'  → GET {remoteURL}/brain/{name}.json
    // mode === 'dual'    → Check current brain, then stack (top to bottom)
}
```

### Switching Modes

```javascript
const brain = require('./lib/brain');

// Check current mode
console.log(brain.getMode());  // 'dual'

// Switch modes
brain.setMode('private');      // Isolated private brain
brain.setMode('dual');         // Back to default

// Remote mode
brain.setRemoteURL('https://brain.example.com');
brain.setMode('remote');
```

### Mode Persistence

Mode is persisted to `models/state.json` on every `setMode()` call and restored on module load.

---

## 4. File Formats

Full multi-format support via `lib/format.js` (v0.8.6+):

### Supported Formats

| Format | Extensions | MIME Types | Parser |
|--------|------------|------------|--------|
| YAML | `.yaml`, `.yml` | `text/yaml`, `application/x-yaml` | `yaml` package |
| JSON | `.json` | `application/json` | Native `JSON.parse` |
| Markdown | `.md` | `text/markdown` | Frontmatter + body |
| Text/INI | `.txt`, `.ini` | `text/plain` | Raw string wrapper |

### Format Detection Priority

1. **Filename extension** (highest confidence: 0.9-0.95)
2. **Content analysis** (JSON: 0.85, YAML: 0.7, MD frontmatter: 0.95)
3. **Default** → `txt` (0.3-0.5)

### Format Constants

```javascript
const format = require('./lib/format');

format.SUPPORTED_FORMATS;
// {
//   yaml: { extensions: ['.yaml', '.yml'], mime: [...] },
//   json: { extensions: ['.json'], mime: [...] },
//   md:   { extensions: ['.md'], mime: [...] },
//   txt:  { extensions: ['.txt', '.ini'], mime: [...] }
// }

format.DEFAULT_EXTENSIONS;
// ['.yaml', '.yml', '.json', '.md', '.txt', '.ini']
```

### Parsing Examples

```javascript
const format = require('./lib/format');

// Auto-detect and parse
const result = format.parse(content);
// { data: {...}, format: 'yaml', chain: ['parse:yaml'], error: null }

// Explicit format
const result = format.parse(content, { format: 'json' });

// With schema validation
const result = format.parse(content, { 
    format: 'yaml', 
    schema: 'workflow',  // or 'island'
    validate: true 
});

// Serialize
const yamlString = format.serialize(data, 'yaml');
const jsonString = format.serialize(data, 'json');
```

### File Operations

```javascript
// Load file (auto-detects format from extension)
const result = await format.loadFile('./models/private/nova/identity.md');
// { data: {...}, content: '...', format: 'md', error: null }

// Save file (auto-serializes based on extension)
await format.saveFile('./models/private/nova/config.json', { key: 'value' });
// Writes formatted JSON

// List brain files recursively
const files = format.listFiles('./models/private', format.DEFAULT_EXTENSIONS, {
    recursive: true,
    excludeDirs: ['boot']
});
// ['models/private/nova/identity.md', 'models/private/nova/geometry/coordinates.json']

// Get brain name from path
format.getBrainName('models/private/nova/notes.json');  // 'notes'
```

---

## 5. Brain Paths

Two root directories with distinct purposes:

### Public Path (OS Template)
```
models/public/
├── vant/
│   ├── identity.md
│   ├── goals.md
│   └── ...
└── nova/
    └── ...
```
- **Purpose**: Read-only OS template brains shipped with Vant
- **Source**: `brain.getPublicPath()` → `models/public`
- **Behavior in dual mode**: Read first, then private overrides

### Private Path (Runtime)
```
models/private/
├── vant/
│   ├── identity.md
│   ├── goals.md
│   ├── lessons.md
│   └── ...
├── nova/
│   └── ...
└── state.json  # Brain stack, mode, neuron state
```
- **Purpose**: Agent runtime writes, persistent across sessions
- **Source**: `brain.getBrainPath()` → `models/private/{currentBrain}`
- **Behavior in dual mode**: Writes go here; reads check here first

### Path Resolution

```javascript
const brain = require('./lib/brain');

// Get current brain's private path
brain.getBrainPath();  // 'models/private/vant'

// Get public template path
brain.getPublicPath(); // 'models/public/vant'

// Resolve any brain name to path
brain.resolveBrainPath('nova');
// { path: 'models/private/nova', type: 'private' }
// or { path: 'models/public/nova', type: 'public' }

// Switch brains (also updates stack)
brain.switchBrain('nova', 'private');
// { brain: 'nova', type: 'private', mode: 'dual', stack: ['nova', 'vant'] }
```

---

## 6. Islands

Islands are **brain modules loaded by trigger** — routing based on source type.

### Island Types

| Type | Source | Loading | Examples |
|------|--------|---------|----------|
| `static` | corpus | Brain router (file-based) | `identity`, `learnings`, `decisions` |
| `lazy` | storage | Dynamic data in storage | `github`, `gitlab`, `linear`, `bitbucket` |
| `runtime` | runtime | In-memory modules | `trust`, `market`, `evolution` |

### Default Islands (`lib/islands.js:80-94`)

```javascript
const DEFAULT_ISLANDS = {
    // Static: loaded from brain corpus
    identity: { name: 'Identity', type: 'static', source: 'corpus', triggers: [] },
    learnings: { name: 'Learnings', type: 'static', source: 'corpus', triggers: [] },
    decisions: { name: 'Decisions', type: 'static', source: 'corpus', triggers: [] },
    // Lazy: dynamic data in storage
    github: { name: 'GitHub', type: 'lazy', source: 'storage', triggers: ['github', 'pr', 'issue', 'push', 'repo', 'commit', 'branch'] },
    gitlab: { name: 'GitLab', type: 'lazy', source: 'storage', triggers: ['gitlab', 'merge', 'mr'] },
    bitbucket: { name: 'Bitbucket', type: 'lazy', triggers: ['bitbucket'] },
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project', 'issue', 'tracker'] },
    // Runtime: in-memory modules
    trust: { name: 'Trust', type: 'lazy', source: 'runtime', triggers: ['trust', 'reputation', 'score'] },
    market: { name: 'Market', type: 'lazy', source: 'runtime', triggers: ['market', 'trade', 'listing', 'bid'] },
    evolution: { name: 'Evolution', type: 'lazy', source: 'runtime', triggers: ['evolution', 'session', 'insight', 'learning'] }
};
```

### Loading Islands

```javascript
const islands = require('./lib/islands');

// Static island (from brain corpus)
const identity = await islands.load('identity');
// { name: 'identity', content: '...', source: 'vant', type: 'corpus' }

// Lazy island (from storage)
const github = await islands.load('github');
// { name: 'github', ...data from storage }

// Auto-hydrate from prompt
const hydrated = await islands.autoHydrate('Check github PR #42');
// ['github']

// Find matching triggers
islands.findTriggers('Create a linear issue for the bug');
// ['linear']

// Get all available
islands.getAvailable();
// [{ key: 'identity', name: 'Identity', type: 'static', source: 'corpus', triggers: [] }, ...]
```

### Island Manifest

Persisted to `models/private/islands.json` (or `models/public/...`):

```json
{
    "version": "1.0",
    "islands": { ...DEFAULT_ISLANDS, ...customIslands },
    "loaded": ["identity", "github"],
    "hydrated": ["identity"]
}
```

### Creating Custom Islands

```javascript
// Static island (creates brain file)
await islands.createIsland('patterns', {
    type: 'static',
    source: 'corpus',
    triggers: ['pattern', 'approach', 'strategy']
});

// Lazy island (storage-backed)
await islands.createIsland('jira', {
    type: 'lazy',
    source: 'storage',
    triggers: ['jira', 'ticket', 'sprint']
});

// Update triggers
await islands.updateTriggers('github', ['github', 'pr', 'issue', 'action']);

// Delete island
await islands.deleteIsland('old-island');
```

---

## 7. Sync Integration

Sync provides **multi-provider redundancy**: push to all, pull from any, with 3-way merge and rebase.

### Core Operations

```javascript
const sync = require('./lib/sync');

// Broadcast brain to ALL configured providers
await sync.pushAll({ commitMessage: 'Vant sync update' });
// { success: true, results: { github: {success: true}, gitlab: {success: true} }, errors: [] }

// Pull from FIRST available provider (with 3-way merge)
await sync.pullAny({ 
    preference: 'github',  // preferred provider
    strategy: 'merge'      // 'merge' | 'replace' | 'pull'
});
// { success: true, provider: 'github', corpus: [...], strategy: 'merge', conflicts: [] }

// Rebase a stale provider
await sync.rebase('github', { strategy: 'auto', force: false });
// { success: true, provider: 'github', conflicts: [], filesMerged: 12 }
```

### 3-Way Merge Strategy

```
                    ┌─ local (current)
base (merge-base) ──┤
                    └─ remote (provider)
```

```javascript
// lib/sync.js:596-671
function threeWayMerge(base, local, remote, options = {}) {
    const { strategy = 'auto' } = options;  // 'auto' | 'ours' | 'theirs' | 'manual'
    
    if (local === remote) return { merged: local, conflicts: [], success: true };
    if (base === local)   return { merged: remote, conflicts: [], success: true };
    if (base === remote)  return { merged: local, conflicts: [], success: true };
    
    // Line-by-line merge with conflict markers for 'auto'/'manual'
    // Returns { merged: string, conflicts: Array, success: boolean }
}
```

### Merge Brain Files (Per-File 3-Way)

```javascript
// lib/sync.js:681-717
function mergeBrainFiles(localFiles, remoteFiles, baseFiles, options = {}) {
    // Merges each brain file independently
    // Returns { merged: {name: content}, conflicts: {name: []}, success: boolean }
}
```

### Provider Management

```javascript
// Get configured providers
const providers = sync.getConfiguredProviders();
// [GitProvider, GitLabProvider, ...]

// Check circuit breaker
sync.isCircuitClosed('github');  // boolean

// Get sync status
await sync.getStatus();
// { providers: { github: {connected: true, branches: 3, current: 'main'} }, lastSync: ..., errors: [] }

// RAID mode (multi-provider)
sync.isRAID();  // true if >1 provider configured
```

### Provider State Tracking

```javascript
// Persisted to models/private/.providers.json
{
    "github": { "status": "healthy", "lastSync": 1234567890, "updated": "2026-09-19T..." },
    "gitlab": { "status": "stale", "lastSync": 1234500000, "updated": "2026-09-18T..." }
}
```

---

## 8. Security

Brain operations run through a **4-layer security chain**:

### Security Chain: Sandbox → VAF → QoS → Escrow

```javascript
// lib/brain.js:289-396
async function _runBrainSecurityChain(operation, options = {}) {
    // 1. SANDBOX: Capability check via sudo escalation
    const sandbox = getSandbox();
    if (!sandbox.can(isWrite ? 'canWrite' : 'canRead')) {
        await sudo.escalate(taskId, isWrite ? 'write' : 'read', { 
            service: 'brain', 
            reason: `Brain ${isWrite ? 'write' : 'read'} operation` 
        });
    }
    
    // 2. VAF: Input validation (type, length, injection checks)
    const vafResult = vaf.check(input, { mode: isWrite ? 'strict' : 'read' });
    if (vafResult.blocked) throw Error('Input validation failed');
    
    // 3. QoS: Rate limiting & circuit breaker
    if (!qos.canProceed()) throw Error('Circuit breaker open');
    if (isWrite) qos.checkInputSize(content);
    
    // 4. RLS: Row-Level Security (per-record ACL)
    const permitted = await rls.checkWrite(userCtx, resource, 'write');
    if (!permitted) throw Error('RLS: Access denied');
    
    // 5. ESCROW: Write budget approval
    if (isWrite && escrow) {
        const canWrite = await escrow.canWrite(userCtx, { category, key });
        if (!canWrite) throw Error('Write not permitted');
    }
}
```

### Capability Mapping (Sandbox → Sudo)

| Sandbox Capability | Sudo Scope | Default |
|--------------------|------------|---------|
| `canRead` | `read` | ✅ true |
| `canWrite` | `write` | ❌ false |
| `canNetwork` | `network` | ❌ false |
| `canExec` | `exec` | ❌ false |
| `canSpawn` | `spawn` | ❌ false |
| `canCommit` | `commit` | ❌ false |
| `canCreateBranch` | `createBranch` | ❌ false |
| `canDelete` | `delete` | ❌ false |
| `canAdmin` | `admin` | ❌ false |

### TOCTOU Fixes (v0.8.6)

- **Direct read with ENOENT handling** instead of `existsSync()` + `readFileSync()` race
- **Path containment validation** in `format.listFiles()` prevents symlink escape
- **Prototype pollution blocking** in `_saveState()` and `register()`
- **YAML unsafe tag (`!!`) blocking** via VAF before parse

### Recursion Guards

```javascript
const guard = require('./recursion');

// Prevent infinite brain/island/sync/dream loops
const depthCheck = guard.check('brain:load:identity');
if (!depthCheck.allowed) throw Error('Recursion depth exceeded');
...
guard.release('brain:load:identity');
```

---

## 9. API Reference

### Brain Router (`lib/brain.js`)

#### Mode Control
```javascript
brain.getMode()                    // 'dual' | 'public' | 'private' | 'remote'
brain.setMode(mode)                // Switch mode, persists to state.json
brain.getRemoteURL()               // Get remote endpoint
brain.setRemoteURL(url)            // Set remote endpoint
```

#### Brain Loading
```javascript
// Load single brain (async, with security chain)
await brain.load('identity');
// { name: 'identity', content: '...', source: 'private', brain: 'vant', format: 'md' }

// Load with options
await brain.load('identity', { 
    brain: 'nova',      // Load from specific brain
    type: 'public',     // 'private' | 'public'
    userCtx: {...},     // For RLS
    habitat: 'default'  // For escrow
});

// Unified read (v0.8.6) - returns parsed data + format
await brain.read('identity', { type: 'private', format: true });
// { data: {...}, content: '...', format: 'md', source: 'private', brain: 'vant', path: '...' }

// Load all brains as merged corpus
await brain.loadCorpus();           // async
brain.loadCorpus({ sync: true });   // sync version
// [{ id: 'identity', title: 'identity', content: '...', format: 'md', source: 'private', type: 'brain' }, ...]

// Load from ALL brains in stack
await brain.loadStackCorpus();
// [{ id: 'identity|vant', title: 'identity', content: '...', brain: 'vant', source: 'vant' }, ...]
```

#### Brain Writing
```javascript
// Write with security chain
await brain.write('learnings', 'new-lesson', 'Content here', { 
    userCtx: {...}, 
    habitat: 'default' 
});

// Append to existing
await brain.append('lessons.md', '\n\nNew entry');

// Write to specific brain in stack
await brain.writeTo({ name: 'nova', type: 'private' }, 'goals', 'New goal');
```

#### Multi-Brain Stack
```javascript
brain.getStack()              // ['vant', 'nova'] (current stack)
brain.getStackAsync()         // async version
brain.pushBrain('nova')       // Add to top of stack
brain.removeBrain('nova')     // Remove from stack
brain.loadStack(['vant', 'nova'])  // Replace entire stack

brain.currentBrain()          // Get current brain name
brain.currentBrain('nova')    // Set current brain
brain.switchBrain('nova')     // Switch + update stack + clear cache

brain.brainDirs('private')    // List available private brains
brain.brainDirs('public')     // List available public brains
brain.brainDirs()             // Both
```

#### Mode Resolution
```javascript
// Async (checks filesystem)
await brain.resolveBrainSource('identity', 'dual');
// { source: 'private', path: 'models/private/vant/identity.md', brainName: 'vant', type: 'private' }

// Sync version
brain.resolveBrainSourceSync('identity', 'dual');
```

#### Cache & Watcher
```javascript
brain.setCache(true, 60000)     // Enable cache with 60s TTL
brain.invalidateCache('identity')  // Invalidate specific
brain.invalidateCache()         // Invalidate all
brain.getCacheStats()           // { size, enabled, ttl, entries: [...] }

brain.setWatch(true)            // Start fs.watch on brain dir
brain.isWatching()              // boolean
```

#### Metrics & Health
```javascript
brain.getMetrics()       // { loads, cacheHits, errors, loadTime, cacheHitRate }
brain.resetMetrics()
brain.getVersion()       // '0.8.6'
await brain.getIdentity() // { name: 'Agent', role: 'AI Agent', source: 'private' }
```

#### Neural Pathways (Access Patterns)
```javascript
brain.fireSynapse('identity', 'goals')     // Track A→B access
brain.predictNext('identity')               // Predict next brain
brain.getSynapses()                         // All synaptic weights
brain.attend('identity', 0.8)               // Set attention (0-1)
brain.getAttention('identity')              // Get attention score
await brain.attendBySemantic(query, ['identity', 'goals'])  // Semantic boost
brain.metabolize()                          // Decay attention, GC cache
```

#### Dreaming (Background Consolidation)
```javascript
// Enable scheduled dreaming at 3AM
await brain.dream(true, 3);

// Run dream NOW (manual consolidation)
await brain.dream(true, 3, true);
// { consolidated: { insights: 5, errors: 2, patterns: 3 } }
```

#### Evolution (Vertical Learning)
```javascript
brain.startEvolutionSession('my-session')
brain.recordChange('write', { brain: 'identity', key: 'name' })
brain.recordInsight('Learned that dual mode is default', { type: 'discovery' })
brain.getEvolutionSession()
await brain.endEvolutionSession()  // Persists insights to state.json
await brain.getEvolutionHistory()  // { lastSession, recentInsights: [...] }
```

#### Geometry (NSC9 Addressing)
```javascript
await brain.geoLoad('9-12345-67890-1', { brain: 'vant' })
await brain.geoStore('my-key', { data: 'value' }, { brain: 'vant' })
// { barcode: '9-12345-67890-1', key: 'my-key', stored: true, brain: 'vant' }
brain.geoList({ brain: 'vant' })      // List geometry dirs
brain.geoBrains()                      // Brains with geometry storage
brain.getGeometryPath('vant')          // 'models/private/vant/geometry'
```

#### Stego Backup/Restore
```javascript
await brain.backupToImage('./backup.png')      // Encode brain to PNG
await brain.restoreFromImage('./backup.png')   // Decode brain from PNG
brain.listBackups()                            // List .png backups
```

#### Personal Data (`brain.myStuff`)
```javascript
brain.myStuff()
// { identity: '...', goals: '...', lessons: '...', loaded: [...], count: 3 }

brain.updateMyStuff('goals', 'New goals content')
brain.myDropFile('note.txt', 'Private note')
brain.myGetFile('note.txt')
brain.myListFiles()
brain.myDeleteFile('note.txt')
```

#### Temp Stash (`brain.yourStuff`)
```javascript
brain.stashYourStuff({ wip: 'in progress' })
brain.yourStuff()           // Get stash
brain.clearYourStuff()
```

#### Framework Config (v0.9.6)
```javascript
brain.getBrainFrameworkConfig()        // Current brain config
brain.setBrainFrameworkConfig({ mode: 'dual' })
brain.getStackFrameworkConfigs()       // All brains in stack
```

---

### Format Handler (`lib/format.js`)

```javascript
const format = require('./lib/format');

// Detection
format.detect(content, { filename: 'file.yaml' })
// { format: 'yaml', confidence: 0.9, source: 'filename' }

format.detectFromPath('./config.json')
// { format: 'json', confidence: 0.95, source: 'path', extension: '.json' }

// Parsing
format.parse(content, { format: 'yaml', schema: 'workflow', validate: true })
// { data: {...}, format: 'yaml', chain: ['parse:yaml', 'validate:workflow'], error: null }

// Serialization
format.serialize(data, 'yaml', { indent: 2 })

// Chained preparation
format.prepare(input, { 
    chain: ['detect', 'sanitize', 'parse', 'validate', 'serialize'],
    schema: 'island'
})

// File I/O
await format.loadFile('./file.md')
await format.saveFile('./file.json', data, { format: 'json' })

// Listing
format.listFiles('./models/private', format.DEFAULT_EXTENSIONS, { 
    recursive: true, 
    excludeDirs: ['boot'] 
})

// Name extraction
format.getBrainName('./models/private/identity.md')  // 'identity'

// Validators
format.registerValidator('custom', (data) => { if (!data.required) throw Error() })
format.validate(data, 'custom')

// Status
format.getStatus()
format.getLayerStatus()
```

---

### Islands (`lib/islands.js`)

```javascript
const islands = require('./lib/islands');

// Core
await islands.load('identity', { brain: 'nova' })     // Load island
await islands.save('github', { repos: [...] })        // Save to storage
await islands.hydrate('github')                       // Load + cache in memory
await islands.dehydrate('github')                     // Remove from memory
await islands.autoHydrate('Check github PR')          // ['github']

// Query
islands.findTriggers('linear issue')                  // ['linear']
islands.getHydrated()                                 // ['identity', 'github']
islands.getAvailable()                                // All island defs
await islands.getManifest()                           // Full manifest

// Management
await islands.createIsland('jira', { type: 'lazy', triggers: ['jira'] })
await islands.updateTriggers('github', ['github', 'pr'])
await islands.deleteIsland('old')
await islands.enableIsland('github')
await islands.disableIsland('github')
islands.getIsland('github')

// Bulk
await islands.bulkCreate([{ name: 'a', triggers: ['a'] }, ...])
await islands.bulkDelete(['a', 'b'])

// Import/Export
islands.exportAll()           // { islands: {...}, exported: timestamp }
await islands.importOne({ name: 'x', type: 'static', triggers: ['x'] })
islands.findByTrigger('pr')   // All islands with 'pr' trigger

// Status
islands.getSummary()          // { name: 'Islands', count: 9, hydrated: 2 }
```

---

### Sync (`lib/sync.js`)

```javascript
const sync = require('./lib/sync');

// Core operations
await sync.pushAll({ commitMessage: 'Update', force: false })
await sync.pullAny({ preference: 'github', strategy: 'merge' })
await sync.rebase('github', { strategy: 'auto', force: false })
await sync.getStatus()

// Merge utilities
sync.threeWayMerge(base, local, remote, { strategy: 'auto' })
sync.mergeBrainFiles(localFiles, remoteFiles, baseFiles, { strategy: 'auto' })

// Provider info
sync.getConfiguredProviders()
sync.getProviderCount()
sync.isRAID()
sync.isCircuitClosed('github')
sync.recordFailure('github')
sync.recordSuccess('github')
sync.getAllCircuits()

// Provider state
await sync.getProviderState('github', { userCtx })
await sync.saveProviderState('github', 'healthy', Date.now(), { userCtx })
await sync.markStale('github')

// Multi-brain stack
sync.getStackSyncStatus()
sync.getStackPrivacy()

// File operations (internal)
await sync.fetchBrainFiles(provider)
await sync.fetchBrainFilesAtCommit(provider, commit)
await sync.writeMergedFiles(provider, mergedFiles)
await sync.getBaseCommit(provider)
await sync.getFileAtCommit(provider, commit, filePath)
```

---

## 10. Configuration

### config.ini / settings.ini (via `lib/config.js`)

Brain reads configuration through the unified config system:

```ini
# config.ini - Brain-relevant settings

# Brain paths
storage.path=models/private
brain.defaultPublic=vant

# Sync
sync.providerTimeout=30000

# Format
# (format.js uses DEFAULT_EXTENSIONS constant, not config)

# Security (VAF)
MAX_STRING_LENGTH=100000
MAX_DEPTH=5
MAX_ARRAY_LENGTH=1000
BLOCK_PATH_TRAVERSAL=true

# Rate Limiting (QoS)
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_HOUR=1000
MAX_BURST=10

# Cache
# brain.setCache(enabled, ttl) - programmatic
```

### Brain State (`models/state.json`)

Persisted automatically by brain:

```json
{
  "neurons": {
    "synapses": { "identity": { "goals": 5 } },
    "attention": { "identity": 0.8, "goals": 0.6 }
  },
  "stack": ["vant", "nova"],
  "mode": "dual",
  "currentBrain": "vant",
  "lastSession": {
    "id": "session-123",
    "startTime": 1234567890,
    "brains": ["vant"],
    "changes": [...],
    "insights": [...]
  },
  "recentInsights": [...],
  "updated": "2026-09-19T04:20:13Z"
}
```

### Islands Manifest (`models/private/islands.json`)

```json
{
  "version": "1.0",
  "islands": {
    "identity": { "name": "Identity", "type": "static", "source": "corpus", "triggers": [] },
    "github": { "name": "GitHub", "type": "lazy", "source": "storage", "triggers": ["github", "pr"] }
  },
  "loaded": ["identity"],
  "hydrated": ["identity"]
}
```

### Provider State (`models/private/.providers.json`)

```json
{
  "github": { "status": "healthy", "lastSync": 1234567890, "updated": "2026-09-19T..." },
  "gitlab": { "status": "stale", "lastSync": 1234500000, "updated": "2026-09-18T..." }
}
```

---

## Common Operations Quick Reference

### Load Agent Identity
```javascript
const brain = require('./lib/brain');
const identity = await brain.load('identity');
console.log(identity.content);  // Raw markdown
console.log(identity.parsed);   // Parsed frontmatter (if .md with frontmatter)
```

### Write Learning
```javascript
await brain.write('learnings', 'new-discovery', `
# Discovery: 2026-09-19

- Brain system uses dual mode by default
- Format layer supports 6 file types
- Islands auto-hydrate on triggers
`);
```

### Sync to GitHub
```javascript
const sync = require('./lib/sync');
await sync.pushAll({ commitMessage: 'Daily brain sync' });
```

### Search Across All Brains
```javascript
const corpus = await brain.loadStackCorpus();
const matches = corpus.filter(b => b.content.includes('pattern'));
```

### Enable Dreaming (Auto-Consolidation)
```javascript
await brain.dream(true, 3);  // Schedule at 3AM
// Or run now:
await brain.dream(true, 3, true);
```

### Create Custom Island
```javascript
const islands = require('./lib/islands');
await islands.createIsland('research', {
    type: 'static',
    triggers: ['research', 'paper', 'study']
});
// Creates models/private/{brain}/research.md
```

---

## References

- Implementation: `lib/brain.js` (3691 lines)
- Format Layer: `lib/format.js` (784 lines)
- Islands: `lib/islands.js` (583 lines)
- Sync: `lib/sync.js` (1186 lines)
- Geometry: `lib/geometry.js`
- Evolution: `lib/evolution.js`
- Security: `lib/sandbox.js`, `lib/vaf.js`, `lib/qos.js`, `lib/escrow.js`, `lib/rls.js`
- Config: `lib/config.js`
- CLI: `bin/vant.js` (commands: `brain`, `sync`, `islands`)

---

## Version History

| Version | Changes |
|---------|---------|
| v0.8.6 | Multi-format support (.yaml, .json, .md, .txt), unified `read()`, `loadFile()`, `saveFile()`, `format.js` |
| v0.8.6 | Islands manifest async, recursion guards, `loadStackCorpus()` |
| v0.8.6 | Sync 3-way merge, rebase, circuit breaker via QoS |
| v0.8.6 | Dream consolidation, evolution sessions, neural pathways |
| v0.8.6 | Security chain: Sandbox → VAF → QoS → RLS → Escrow |
| v0.8.7 | Multi-agent crew, MCP brain tools (21 tools) |
| v0.9.0 | Trust/Market/Evolution islands, NSC9 geometry, stego backup |
| v0.9.6 | Framework config absorption, brain.myStuff/yourStuff |

(End of document)