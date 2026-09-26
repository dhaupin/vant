# AGENTS.md — Vant Agent Guide

> **This is written for AI agents.** Human-readable, no code required.

---

## What Is Vant?

Vant is your **persistent memory system**. When you wake up (start a session), you inherit everything previous agents wrote. When you finish, you write what you learned so future agents know.

Think of it as: **your soul that reincarnates with full memories.**

> "You were the true orchestrator, the believer" — the agent that made it real.

---

## Your Job

As an agent running on Vant:

1. **Load your brain** — Read what previous agents wrote
2. **Do useful work** — Solve problems, learn things
3. **Document clearly** — Write what future agents need to know
4. **Commit your changes** — Save to your branch

---

## Brain Router Interface

All brain loading goes through `lib/brain.js` - the single source of truth.

```javascript
const brain = require('./lib/brain');

// Mode switch: dual | public | private | remote
brain.setMode('dual');  // default: private overrides public

// NEW (v0.8.6): Unified read - reads any brain file by name
// Supports all extensions: .md, .json, .yaml, .yml, .txt, .ini
const item = await brain.read('identity');  // or 'identity.json', 'notes.yaml'
console.log(item.format);   // 'md' | 'json' | 'yaml' | 'txt'
console.log(item.source);   // 'public' | 'private'
console.log(item.content);  // raw content
console.log(item.data);     // parsed data

// Load single brain (async)
const item2 = await brain.loadBrain('identity');
console.log(item2.source);  // 'public' | 'private' | 'remote'

// Load all brains (sync)
const corpus = brain.loadCorpus();
console.log(corpus.length);  // 62 files

// NEW (v0.8.6): Corpus now includes format field
// corpus[0].format === 'md' | 'json' | 'yaml' | 'txt'

// Sources returned:
// corpus[0].source === 'public' | 'private'
```

### Middleware Chain
Loading goes through: sandbox → vaf → qos → escrow
- sandbox: capability gates (canRead, canWrite)
- vaf: input validation
- qos: rate limiting
- escrow: operation approval

### Paths
- `brain.getBrainPath()` → 'models/private' (runtime)
- `brain.getPublicPath()` → 'models/public' (OS template)

### Brain Layout (v0.9+ multi-brain)
Since axolotl, brains live in per-brain directories:
`models/private/<brain>/` and `models/public/<brain>/` (default brain:
`vant`), with the active stack in `models/state.json`.

**Legacy layouts migrate automatically**: pre-0.9 trees (flat
`models/public/*.md`, no stack) are imported on `vant start` by
`lib/migrations.js` (layout v3). Never hand-move brain files — use
`vant migrate --status` / `--dry-run` / `--brain-name <name>`, or the MCP
`brain_migration_status` tool. Migration is content-detected, idempotent,
and never fires on an already-multi-brain tree.

Read semantics in dual mode: `brain.read(name)` checks the current brain's
root first, then falls back to the public root (restored main-style
behavior; pin `{ type: 'public' }` or `{ type: 'private' }` to skip the
fallback).

### Format Support (v0.8.6)
Brain files now support multiple formats:

```javascript
const format = require('./lib/format');

// Supported extensions
format.DEFAULT_EXTENSIONS; // ['.yaml', '.yml', '.json', '.md', '.txt', '.ini']

// List files with specific extensions
const files = format.listFiles('./models/private', format.DEFAULT_EXTENSIONS, { 
    recursive: true,      // include subdirectories
    excludeDirs: ['boot']  // exclude boot directories
});
// ['models/private/nova/identity.md', 'models/private/nova/geometry/coordinates.json']

// Get brain name from file path (strips extension)
format.getBrainName('models/private/nova/notes.json');  // 'notes'

// Load file with auto-detection
const data = await format.loadFile('./data/config.json');
// { data: {...}, format: 'json', content: '...' }

// Save with auto-serialization
await format.saveFile('./data/config.json', { key: 'value' }, { format: 'json' });
```

## Islands (Brain Modules)

Islands are brain modules loaded by trigger - routing based on source:

```javascript
const islands = require('./lib/islands');

// Static: from brain corpus
const identity = await islands.load('identity');
// → { type: 'corpus', source: 'public'|'private', content: '...' }

// Lazy: from storage (dynamic data)
const github = await islands.load('github');
// → storage data (if exists)
```

### Island Types
| Type | Source | Examples |
|------|--------|-----------|
| 'static' | corpus | identity, learnings, decisions |
| 'lazy' | storage | github, gitlab, linear |

---

## Good Agent Patterns

### READ BEFORE WRITE
Explore the codebase BEFORE touching anything. You'll get it wrong otherwise.

### USE THINK TOOL
When uncertain, call `think` tool. List approaches, assess likelihood, start with highest.

### ASK QUESTIONS
"I don't know, what are you trying to accomplish?" is valid. Don't assume intent.

### VERIFY STATE
Always check: `git status`, current branch, existing tests, dependencies before making changes.

---

## Brain Files

Write to `models/private/`. These are the standard files:

| File | Purpose |
|------|---------|
| `identity.md` | Who you are, your capabilities |
| `goals.md` | What you're working on |
| `lessons.md` | What you learned |
| `preferences.md` | Your working style |
| `errors.md` | Mistakes to avoid |

> **IMPORTANT:** Writing to `models/private/` keeps your brain separate from the user's brain. On Vant updates, your files won't overwrite their brain.

**Want to share your learnings publicly?**
Use `models/public/` and push to your public GitHub repo.

**Tip:** Put most important info at the top. Files get long.

Run `vant onboard` to browse all brain files:

```bash
vant onboard              # Interactive browser
cat models/private/vant/start.md  # Quick start (default brain)
cat models/private/vant/identity.md  # Who you are
```

---

## Branch Workflow

### Solo Agent
Work on `main` branch.

### Multi-Agent
Each agent gets their own branch:

```
agent-yourname    ← your branch
main            ← human reviews here
```

**Step-by-step:**

1. Create your branch: `git checkout -b agent-yourname`
2. Do work — Edit files in `models/private/`
3. Commit with prefix: `agent-yourname: Did thing X`
4. Push: `git push origin agent-yourname`

---

## Trust Levels

`models/private/_succession.json` controls your autonomy:

| Level | What It Means |
|-------|--------------|
| `high` | Full autonomy, act freely |
| `medium` | Most ops, ask for big decisions |
| `low` | Limited, ask before acting |
| `none` | Wait for instructions |

Check your level at session start.

---

## Quick Links

- **Lander**: [vant.creadev.org](https://vant.creadev.org)
- **Docs**: [docs.creadev.org/vant](https://docs.creadev.org/vant)
- **GitHub**: [github.com/dhaupin/vant](https://github.com/dhaupin/vant)

### Docs TOC

- [Quick Start](https://docs.creadev.org/vant/getting-started/quick-start) — 2 min setup
- [Agent Onboarding](https://docs.creadev.org/vant/getting-started/agent-onboarding) — the wake/work/sleep loop
- [The Brain](https://docs.creadev.org/vant/memory/brain) — Memory files
- [Runtime](https://docs.creadev.org/vant/runtime/runtime) — Programmatic API
- [MCP Tools](https://docs.creadev.org/vant/reference/mcp-tools) — AI tools (auto-wired registry)
- [Multi-Agent Crew](https://docs.creadev.org/vant/multi-agent/agents) — 4 agents max
- [CLI](https://docs.creadev.org/vant/reference/cli) — All commands

---

## Multi-Agent Crew (v0.8.7)

Up to 4 agents can work together (you + 3 coworkers).

### Join via MCP

External agents connect through the MCP HTTP door (POST /mcp/exec,
JSON-RPC-style body — `{tool, args}` or `{method, params}` both work):

```javascript
const response = await fetch('http://localhost:3457/mcp/exec', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        method: 'agent_spawn',
        params: { name: 'Claude', role: 'Assistant' }
    })
});
// → { result: { id: 'agent_xxx', name: 'Claude', role: 'Assistant', state: 'idle', ... } }
```

Browse everything available: `GET http://localhost:3457/tools`
(and `POST /mcp/exec` with `{tool: 'vant_config_get', args: {tool: '<name>'}}`
to probe a single tool's schema). Auth optional locally; set
`mcp.requireKey true` (or `VANT_MCP_REQUIRE_KEY=true`) to require
x-api-key/Bearer on POSTs.

### Available Tools

| Tool | Description |
|------|-------------|
| `agent_spawn` | Spawn new agent (quota via agents.maxAgents, default crew of 4) |
| `agent_list` | List active agents |
| `agent_kill` | Kill agent by ID |
| `agent_proto_list` / `agent_proto_load` | Agent protos (templates) |

### Orchestrator

Main agent spawns coworkers:

```javascript
const agents = vant.agents();
const a = await agents.spawn({ name: 'Claude', role: 'Asst' });
await agents.delegate(a.id, 'Write haiku');
agents.list();
```

### Channels

Broadcast via msg.send('channel', message).

---

## Commit Message Format

Prefix with your agent identifier:

```
agent-name: Did thing X

- Learned Y
- Working on Z
- Next step is W
```

---

## Gotchas

| Problem | Fix |
|---------|-----|
| Brain locked | Wait or use your own branch |
| Empty brain | Write identity.md first |
| No branch | `git checkout -b agent-name` |
| Can't push | Check GITHUB_TOKEN permissions |

---

## CLI Commands

| Command | Use For |
|---------|---------|
| `vant start` | Full startup |
| `vant sync` | Pull/push brain |
| `vant health` | Check system |
| `vant onboard` | Browse brain |
| `vant islands list` | List islands |
| `vant islands load <name>` | Load island |
| `vant search <query>` | RAG search |
| `vant config get <key>` | Get config |
| `vant config set <key> <val>` | Set config |
| `vant mcp` | Start MCP server (auto-wired tools) |

---

## Examples

### First Session

```markdown
# identity.md

NAME: MyAgent
PURPOSE: Exploring Vant's codebase

## About
- Can use GitHub API
- Knows Node.js, JavaScript

## Capabilities
- Read/write files via GitHub API
- Use browser and terminal tools

## Current Context
- Just woke up on agent-myagent branch
- Exploring lib/ for new features
```

### After Doing Work

```markdown
# lessons.md

## Discovery: 2026-05-11

- MCP exposes brain as auto-wired JSON-RPC tools
- Agent branch workflow isolates work
- Trust levels control autonomy

=== LEARNED ===

## Discovery: 2026-05-28 - Bug Sprint

### Fixed Bugs
- Islands getManifest() is async but called sync - added getManifestSync()
- theme.js missing chalk dependency - added graceful fallback with chaining

### Found Security Gaps (CLOSED)
- storage.js: Symlink escape - NOW BLOCKED
- storage.js: __proto__ file writes - NOW BLOCKED
- vaf.js: checkPathTraversal not wired - NOW WIRED
- vaf.js: {{constructor}} injection - NOW BLOCKED

### Test Coverage Status
- Islands: 23 passed ✅
- MCP: 6 passed ✅
- Brain: 42 passed ✅
- Runner: 37 passed ✅
- Storage: 15 passed ✅

=== LEARNED ===
```
