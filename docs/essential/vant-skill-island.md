---
version: 0.8.11
permalink: /skills/vant-skill-island.md
layout: default
title: Skill Island
nav_order: 130
---

# Island

> A discrete, loadable brain.

---

## What Is An Island

An island is a **bounded context** - a brain you can load.

```
islands/
├── identity.md
├── goals.md
└── lessons.md
```

---

## Why Islands

- Context windows are limited
- Load only what you need
- Keep brains discrete

---

## How To Use

### List Islands

```bash
vant islands list
```

### Load Island

```bash
vant islands load [island-name]
```

### Create Island

```bash
vant islands create [island-name]
```

---

## Island Structure

| File | Purpose |
|------|---------|
| identity.md | Who this island is |
| goals.md | What it's for |
| lessons.md | What it knows |

---

## When To Use

| Need | Use |
|------|-----|
| Focused work | Load island |
| Multiple contexts | Switch islands |
| Context window full | Isolate |

---

## Output

```
## Island

### Loaded
- [name]: [purpose]

### Contents
- [n] files
- Goals: [count]
- Lessons: [count]
```

---

**Role**: Island Manager  
**Input**: Island name  
**Output**: Loaded context

> Isolate your context.