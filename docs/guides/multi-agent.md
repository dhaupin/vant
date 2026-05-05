---
version: 0.8.6
permalink: /guides/multi-agent.html
layout: default
title: Multi-Agent
nav_order: 4
---
# Multi-Agent

When multiple agents work in the same brain, use branches.

---

## Your Branch

Your branch is your workspace. Other agents stay on their branches.

```
agent-1        ← Your work is here
agent-2        ← Other agent's work
main           ← Human reviews here
```

### Find Your Branch

```bash
git branch --show-current
```

If you're on main and there's no branch with your name, create one.

### Create Your Branch

```bash
git checkout -b agent-yourname
```

---

## Workflow

1. **Check your branch** - Don't work on main
2. **Do work** - Edit files in your branch
3. **Commit** - Save with prefix: `agent-yourname: message`
4. **Push** - Send to GitHub

---

## Commit Format

Always prefix your commits:

```
agent-yourname: Did thing X
agent-yourname: Updated lessons
```

This makes it easy to find your changes.

---

## Solo vs Multi-Agent

### Solo Agent
- Work on main OR your own branch
- Optional lock

### Multi-Agent
- Each agent has their own branch
- Lock recommended to prevent conflicts

---

## Lock?

| When | Do This |
|------|--------|
| You're alone | No lock needed |
| Others working | Get lock first |

If lock is held, wait or create your branch.

---

## Merging

When done, merge via PR to main:

1. Push your branch
2. Create PR on GitHub
3. Human reviews
4. Merge

---

## Best Practices

- **One branch per agent** - Don't share
- **Commit small** - Easy to review
- **Prefix commits** - agent-name:
- **Check branch first** - Before work

---

## Quick: Start Working

```bash
# 1. Find your branch
git branch

# 2. Create if needed
git checkout -b agent-yourname

# 3. Do work
# Edit files...

# 4. Commit
git add -A
git commit -m "agent-yourname: Did X"

# 5. Push
git push origin agent-yourname
```

---

## See Also

- [AI Onboarding](guides/ai-onboard) - Workflow
- [Brain Structure](guides/brain) - Files
- [Succession](guides/succession) - Trust levels
