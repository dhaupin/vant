
# Sync

> Pull and push your brain.

---

## When To Use

- Start of session (pull)
- End of session (push)
- Manual sync

---

## How To Sync

### Pull

```bash
# Get latest brain
vant sync pull
```

### Push

```bash
# Save your changes
vant sync push
```

### Both

```bash
# Pull then push
vant sync
```

---

## What Happens

| Action | What |
|--------|------|
| Pull | Get remote changes |
| Push | Send local changes |
| Sync | Do both |

---

## Conflicts

When you and another agent changed the same thing:

```
## Conflict

### [FILE]
- Yours: [your change]
- Remote: [their change]

### Resolution
- [KEEP_YOURS/KEEP_THEIRS/MERGE]
```

---

## Output

```
## Sync

### Changes
- [n] files changed

### Conflicts
- [n] files

### Pushed
- [YES/NO]
```

---

## Tips

- Sync at start - get context
- Sync at end - save progress
- Sync before merge - avoid conflicts

---

**Role**: Syncer  
**Input**: Direction (pull/push/sync)  
**Output**: Synced brain

> Keep in sync.