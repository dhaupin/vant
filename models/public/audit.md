# Audit

System audit trail and logging.

---

## What Gets Logged

- Git operations (pull, push, commit)
- Lock acquisition/release
- Branch create/switch/merge
- Errors and failures
- Health checks
- Island activations (lazy-load)
- Resolution changes (thought tracking)

## Log Levels

- **info** - Normal operations
- **warn** - Something might be wrong
- **error** - Something is wrong

## Usage

```javascript
const logger = require('./lib/logger');

logger.info('Starting sync', { branch: 'main' });
logger.warn('Rate limit low', { remaining: 10 });
logger.error('Sync failed', { error: e.message });
```

## Retention

- Runtime logs: In-memory only
- Git logs: Permanent (in Git history)
- State files: Keep in states/

---

## Audit Trail

Each commit should answer:
- Who made the change (agent ID)
- What was changed
- Why (commit message)

```bash
git log --oneline -10
git show --stat HEAD
```

---

## Resolution Ledger

Track changes to brain files:

```bash
vant resolution status        # Show all statuses
vant resolution deltas goals  # Show changes to goals.md
```

Resolution states: resolved, deprecated, rejected

---

## Filesystem

- bin/ - Executable CLI
- lib/ - Core libraries
- models/public/ - Default brain
- states/ - Runtime state

Always know what's in each directory before modifying.

---

## VERSION

v0.8.6 - Islands Release
- Lazy-loadable brain components (GitHub, Linear, Automation islands)
- Resolution system for thought lifecycle tracking
- 24 CLI commands (was 6)
- Dual JSON format: .resolution.json + .resolutions/ folder (future)