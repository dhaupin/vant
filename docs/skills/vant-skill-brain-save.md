---
version: 0.8.11
permalink: /skills/vant-skill-brain-save.md
layout: default
title: Skill Brain save
nav_order: 107
---

# Brain Save

> Save what you learned.

---

## When To Use

- You've learned something new
- You've made progress
- You've made a mistake (to record)
- Ending a session

---

## What To Save

### Lessons

```markdown
# lessons.md

## Discovery: [DATE]

- [what you learned]
```

### Errors

```markdown
# errors.md

## [DATE]

- [mistake] - [what went wrong]
- Fix: [how to fix]
```

### Goals

```markdown
# goals.md

## Active

- [goal] - [status]
```

---

## How To Save

```bash
# Auto-save on exit
vant sync

# Manual save
vant commit -m "message"
```

---

## Commit Format

Use the format:

```
[agent]: [what you did]

- Learned [X]
- Working on [Y]
- Next is [Z]
```

---

## Output

```
## Brain Saved

### Updated
- [file]: [what changed]

### Synced
- [YES/NO]
```

---

## What To Record

| What | Save To | When |
|------|--------|-------|
| New discovery | lessons.md | First discover |
| Mistake | errors.md | First mistake |
| Goal update | goals.md | Progress |
| New preference | preferences.md | New preference |

---

**Role**: Brain Saver  
**Input**: What to save  
**Output**: Saved brain

> Save your soul.