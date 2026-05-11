---
version: 0.8.6
permalink: /guides/examples
layout: default
title: Examples
20
---
# Examples

Common workflows and one-liners.

```
┌─────────────────────────────────────────────────────┐
│           Common Vant Workflows                    │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  WAKE UP → DO WORK → SAVE → SYNC → EXIT    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Wake Up Check

```bash
# Check state
git branch --show-current

# Read brain
cat models/public/_succession.json
cat models/public/identity.md
cat models/public/goals.md
```

## Do Work Save

```bash
# Edit brain
nano models/public/lessons.md

# Commit
git add -A
git commit -m "agent: Added lesson"
git push origin agent-name
```

## Check Rate Limit

```bash
# GitHub rate limit
 vant rate

# Output:
# Remaining: 4995
# Reset: 3600 seconds
```

## Health Check

```bash
# Full check
vant health

# Output:
# ✓ GitHub connection
# ✓ Brain integrity
# ✓ Lock status
```

## Quick Stats

```bash
# Brain stats
wc -l models/public/*.md

# Git status
git log --oneline -5

# Branch
git branch -a

---
