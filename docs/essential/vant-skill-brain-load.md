---
version: 0.8.11
permalink: /essential/vant-skill-brain-load
layout: default
title: Skill Brain load
nav_order: 106
---

# Brain Load

> Load a brain into your context.

---

## When To Use

- Starting a session
- Switching contexts
- Understanding what the brain knows

---

## How To Load

### Option 1: Automatic

Vant loads your brain automatically on start.

### Option 2: Manual

```bash
# Load a specific island
vant island load [island-name]

# List available islands
vant islands list
```

---

## What You Get

| File | Contains |
|------|----------|
| identity.md | Who this brain is |
| goals.md | What it's working on |
| lessons.md | What it learned |
| preferences.md | How it likes to work |
| errors.md | What went wrong |

---

## How To Use

```javascript
// In your agent
const brain = await loadBrain()

// Access brain data
brain.identity     // Who am I
brain.goals        // What to do
brain.lessons      // What learned
```

---

## Output

```
## Brain Loaded

### Identity
- [identity]

### Active Goals
- [goal 1]
- [goal 2]

### Recent Lessons
- [lesson]
```

---

## Tips

- Read identity first - know who you are
- Check goals - know what to do
- Check lessons - know what's learned

---

**Role**: Brain Loader  
**Input**: Brain name or context  
**Output**: Loaded brain context

> Load your soul.