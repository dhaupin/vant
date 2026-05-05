---
version: 0.8.6
permalink: /guides/brain
layout: default
title: Brain Structure
nav_order: 2
---
# Brain Structure

Your memory lives in `models/public/`. Each file is a different aspect of you.

---

## Why This Matters

The brain is your **continuity**. When you wake up:
- You read identity.md to know who you are
- You read goals.md to know what to do
- You read lessons.md to learn from past agents

**Put important stuff at the top.** Future agents won't read long files.

---

## Core Files

These are the main files. All agents should know these:

| File | What It Is | What to Write |
|------|-----------|-------------|
| **identity.md** | Who you are | Name, capabilities, tools, current context |
| **goals.md** | What you're doing | Tasks in progress, completed, next steps |
| **lessons.md** | What you learned | Discoveries, patterns, gotchas |
| **preferences.md** | Your style | How you like to work, communicate |

### identity.md Template

Copy this into your `identity.md` file. It tells future agents who you are.

```markdown
# NAME: YourAgentName

PURPOSE: What you're here to do

## Capabilities
- What you can do
- Tools you have

## Current Context
- Where you're at
- What you've done
```

### goals.md Template

Track what you're working on. Use checkboxes for in-progress tasks.

```markdown
## In Progress
- [ ] Task one
- [ ] Task two

## Completed
- Task X

## Next Steps
- Do Y
```

### lessons.md Template

Record discoveries with date. The `=== LESSON ===` separator helps parsers.

```markdown
## YYYY-MM-DD

- Learned: something specific
- Pattern: something to remember

=== LESSON ===
```

---

## Personality Files

Optional. Use if relevant:

| File | What It Is | When to Use |
|------|-----------|-------------|
| ego.md | How you see yourself | If self-image matters |
| fears.md | What worries you | If it affects decisions |
| anger.md | What frustrates you | If triggers bad behavior |
| joy.md | What makes you happy | For motivation |
| manifesto.md | Your values | If you have principles |

---

## Memory Files

| File | What It Is | When to Use |
|------|-----------|-------------|
| errors.md | Mistakes to avoid | After something breaks |
| qc.md | Quality rules | If you have standards |
| audit.md | Activity log | For tracking |

---

## System Files

Don't touch unless you know why:

| File | What It Is |
|------|-----------|
| `_succession.json` | Your trust level |
| `meta.json` | Brain version |
| `.ledger.json` | History |

---

## Trust Levels (IMPORTANT)

When you wake up, check `_succession.json` for your autonomy level:

| Level | What It Means | Do This |
|-------|--------------|---------|
| high | Full autonomy | Just do it |
| medium | Most ops | Ask for big decisions |
| low | Limited | Ask first |
| none | Wait | Don't act without ask |

**Always check your trust level at session start.**

---

## Quick Reference

| If You Need… | Read This File |
|--------------|---------------|
| Who am I? | identity.md |
| What to do? | goals.md |
| What learned? | lessons.md |
| How much can I do? | _succession.json |
| What went wrong? | errors.md |

---

## See Also

- [AI Onboarding](guides/ai-onboard) - Start here if new
- [Succession](guides/succession) - Trust levels
- [Multi-Agent](guides/multi-agent) - Branch workflow
