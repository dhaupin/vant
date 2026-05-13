---
version: 0.8.11
permalink: /skills/vant-skill-git.md
layout: default
title: Skill Git
nav_order: 123
---

# Git

> Version control.

---

## When To Use

- Any codebase
- Track changes
- Collaboration

---

## What To Do

### 1. Basic Commands

| Command | What |
|---------|------|
| git status | Working tree |
| git add | Stage changes |
| git commit | Save changes |
| git push | Upload |
| git pull | Download |
| git clone | Copy repo |

### 2. Branches

```bash
git checkout -b new-branch
git branch -d old-branch
git merge feature
```

### 3. History

```bash
git log --oneline
git diff HEAD~1
git show commit:file
```

### 4. Remote

```bash
git remote -v
git fetch origin
git rebase main
```

---

## Output

```
## Git

| Branch | Status |
|--------|--------|
| main | [current] |

### Changes
- [staged]: [n]
- [unstaged]: [n]
```

---

**Role**: Git User  
**Input**: Changes  
**Output**: Tracked

> Version control.