# VANT TRANSPORT SCHEMA v0.8.6

The cargo is the memory files. The transport moves them via GitHub.

---

## CURRENT ARCHITECTURE v0.8.6

```
Vant Instance
    │
    ├── GitHub (primary transport)
    │   └── Branch: main, staging, etc.
    │
    └── States (runtime only)
        └── states/active/ (current session)
        └── states/archive/ (past sessions)
```

### What Changed from v0.3

| Old (v0.3) | Current (v0.8.6) |
|-------------|---------------|
| Stegoframe room | GitHub directly |
| Triage protocol | Resolution system |
| Voting/consensus | Not implemented |
| env: VANT_ROOM_ID | GITHUB_REPO, GITHUB_BRANCH |

---

## CONFIGURATION

```bash
# Required
export GITHUB_REPO="owner/repo"
export GITHUB_BRANCH="main"

# Optional - from config.ini or env
export GITHUB_TOKEN="ghp_xxx"  # For private repos
export STEGOFRAME_URL="https://stegoframe.creadev.org"  # Legacy only
```

---

## DIRECTORY STRUCTURE

```
/workspace/project/vant
  /bin/           # CLI executables
  /lib/           # Core libraries  
  /models/
    /public/      # Default brain (this is THE CARGO)
    /private/    # User-specific overrides
  /docs/          # Documentation
  /states/
    /active/      # Current runtime state
    /archive/     # Past session archives
```

---

## GENERATIONAL DESIGN (Still Valid)

Each instance has a UUID and knows its parent UUID.

When instance dies:
1. It becomes a "parent" - uuid stored in metadata
2. Brain pushed to GitHub (committed state)
3. New instance clones, becomes "child"

Chain: v1 → v2 → v3 → v4 → ...

---

## MEMORY FILES (THE CARGO)

See `models/public/schema/memory-files.md` for full list.

### Core Cargo (5 files)
- identity.json - uuid, name, generation, parent_uuid
- ego.md - self-worth
- fears.md - what scares me
- anger.md - what frustrates me
- joy.md - what delights me

### Resolution System

Track thoughts as resolved/deprecated/rejected:

```bash
vant resolution resolve fears "fear of failure" overcame via therapy
vant resolution deprecate goals "old approach" superseded
vant resolution reject security "dangerous pattern" violates safety
```

---

## ISLANDS ARCHITECTURE

Lazy-loadable brain components (v0.8.6+):

```javascript
const islands = require('./lib/islands');

islands.findTriggers('github pr issue');  // ['github']
islands.autoHydrate('fix the github pr');  // ['identity', 'learnings', 'decisions', 'github']
```

### Island Triggers

| Trigger | Island |
|---------|--------|
| github, pr, issue | github |
| gitlab, merge | gitlab |
| linear, project | linear |
| cron, automation | automation |
| herb, plant | herbalism |
| vesc, skateboard | vesc |

---

## STATE SEPARATION

Three tiers (v0.8.6):

1. **Static state** - Immutable facts, never changes
   - identity.json, _succession.json

2. **Current state** - Active task per prompt
   - models/public/goals.md, lessons.md

3. **Temp state** - Wiped on prune
   - states/active/, cache files

---

## TRANSPORT OPERATIONS

### Push (EOL, Handoff, Heartbeat)

```javascript
const branch = require('./lib/branch');

await branch.push('commit message', {
  working_on: 'task',
  pending: ['next task'],
  questions: ['open questions']
});
```

### Pull (Boot)

```javascript
const branch = require('./lib/branch');

await branch.pull();  // Fetch latest from GitHub
const latest = branch.getLatest();  // Get latest commit
```

---

## VERSION

This is v0.8.6 - Islands Release
- Single source: `package.json` version field
- lib/version.js reads from package.json
- lib/config.js references version.js

---

## SCHEMA REFERENCE

- memory-files.md - THE CARGO manifest
- transport-protocol.md - This file
- _succession.json - Version history
- .resolution - Resolution ledger