---
version: 0.8.11
permalink: /tutorials/multi-repo
layout: default
title: Multi-Repo
nav_order: 13
---

# Tutorial: Multi-Repo Setup

> Work with multiple repositories

## Why

Mount multiple brains:
- Different projects
- Team vs personal
- Staging vs production

## Setup

### Add Repository

```bash
# Add second repo
vant repo add work --url https://github.com/team/work-brain

# Use specific repo
vant use work
```

### List Repos

```bash
# List all repos
vant repo list

# Output:
# personal  GitHub (active)
# work     GitHub
# staging  GitHub
```

## Switch Context

```bash
# Switch to work repo
vant switch work

# Now all commands use work brain
vant load    # loads from work brain
vant commit # commits to work brain
```

## Use Cases

### Team + Personal

```
personal brain: learnings, decisions
work brain: work-specific
```

### Dev + Prod

```
dev brain: experimental
prod brain: stable
```

---

## More

See [Repos](/guides/repos) and [Islands](/guides/islands).