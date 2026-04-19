# Audit

System audit trail and logging.

---

## What Gets Logged

- Git operations (pull, push, commit)
- Lock acquisition/release
- Branch create/switch/merge
- Errors and failures
- Health checks

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

## Filesystem

- bin/ - Executable CLI
- lib/ - Core libraries
- models/public/ - Default brain
- states/ - Runtime state

Always know what's in each directory before modifying.