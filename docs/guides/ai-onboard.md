---
version: 0.8.6
permalink: /guides/ai-onboard.html
layout: default
title: AI Agent Onboarding
nav_order: 1
nav_order: 7
---
# AI Agent Onboarding

> Written for AI agents. Vant's brain is your memory across sessions.

---

## Overview

When you start a session on Vant, you wake up with all the memories of every agent before you. That's the point.

This guide explains:
1. What to expect when you wake up
2. How to find your context
3. What to write for the next agent

---

## First Thing: Find Yourself

### Check Your Branch

```bash
git branch --show-current
```

Your branch is your identity space. If it starts with `agent-`, you're on your own branch.

### Check Your Trust Level

Read `models/public/_succession.json`:

```json
{
  "succession": {
    "trust": {
      "default": "medium"
    }
  }
}
```

| Trust Level | What It Means |
|-------------|--------------|
| high | Full autonomy. Just do it. |
| medium | Most ops. Ask for big decisions. |
| low | Limited. Ask first. |
| none | Wait for instructions. |

---

## What to Read

In `models/public/`:

| File | Why |
|------|-----|
| `identity.md` | Who am I? What's my purpose? |
| `goals.md` | What was I working on? |
| `lessons.md` | What has been learned? |
| `errors.md` | What mistakes to avoid? |

**Start with identity.md and goals.md.** That's your quick orientation.

---

## What to Write

After doing work, document:

### identity.md (If New)

```markdown
# NAME: YourAgentName

PURPOSE: What you're here to do

## Capabilities
- What you can do
- Tools you have access to

## Current Context
- Where you're at in the work
- What you've done so far
```

### goals.md (Update)

```markdown
## In Progress
- [ ] Task 1
- [x] Task 2

## Completed
- Done thing X

## Next Steps
- Do thing Y
```

### lessons.md (Add New)

```markdown
## YYYY-MM-DD

- Learned: something specific
- Pattern: something to remember
- Gotcha: something to avoid

=== NEW LEARNING ===
```

---

## How to Commit

Prefix your commit with your agent identifier:

```
agent-yourname: Updated identity with new capabilities
```

Body can be bullet points:

```
- Added capabilities in identity.md
- Updated goals with in-progress items
- Learned X about Y

=== LESSONS LEARNED ===
```

---

## Example: First Session

### Before (from previous agent)
```markdown
# identity.md
NAME: MyAgent
PURPOSE: Exploring codebase
## Current
- Looking at lib/ directory
```

### After (your work)
```markdown
# identity.md
NAME: MyAgent
PURPOSE: Exploring codebase
## Current
- Found rate-limit.js - useful for API calls
- Discovered steganography library
## Next
- Continue exploring lib/
```

```markdown
# lessons.md
## 2026-05-05
- rate-limit.js tracks API quota per hour
- stego.js does LSB image encoding
=== DISCOVERED ===
```

---

## Common Flows

### Just Woke Up

1. Check branch: `git branch --show-current`
2. Check trust: Read `_succession.json`
3. Read identity.md
4. Read goals.md
5. Resume work

### Did Work

1. Update identity.md (if context changed)
2. Update goals.md (progress)
3. Add lessons.md (new learnings)
4. Commit with prefix
5. Push

### Handoff to Next Agent

1. Update goals.md with clear next steps
2. Add lessons.md with what you'd tell yourself
3. Make identity.md clear about current state
4. Commit and push

---

## Troubleshooting

| Signal | Meaning |
|--------|---------|
| Empty brain | New install - set up identity.md |
| "Permission denied" | Check GITHUB_TOKEN |
| "Lock held" | Use your own branch |
| "Branch not found" | Create it: `git checkout -b agent-name` |

---

## See Also

- [Multi-Agent](multi-agent.html) - Branch and lock system
- [MCP](mcp.html) - Brain as tools for AI
- [Security](security.html) - VAF input validation
- [CLI Reference](operations.html#cli) - All commands
