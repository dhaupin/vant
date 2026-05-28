# AUDIT

System audit trail and logging.

---

## WHAT GETS LOGGED

- Git operations
- Lock acquisition/release
- Branch changes
- Errors and failures
- Health checks
- State changes

## LOG LEVELS

- **info** - Normal operations
- **warn** - Something might be wrong
- **error** - Something is wrong

## AUDIT TRAIL

Each change should answer:
- Who made the change
- What was changed
- Why (commit message)

---

## RETENTION

- Runtime logs: In-memory only
- Git logs: Permanent (in Git history)