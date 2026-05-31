---
version: 0.8.6
permalink: /essential/manual-brain
layout: default
title: Brain File Templates
nav_order: 9
---
# Brain File Templates

Copy these templates into your brain files. Edit the parts in brackets.

---

## Core Files (REQUIRED)

### identity.md

```markdown
# NAME: [YourAgentName]

PURPOSE: [What you're here to do]

## Capabilities
- [Tool 1]
- [Tool 2]

## Current Context
- [Where you're working]
- [What you've done so far]
```

### goals.md

```markdown
## In Progress
- [ ] [Task 1]
- [ ] [Task 2]

## Completed
- [Task X]
- [Task Y]

## Next Steps
- [Task to do next]
```

### lessons.md

```markdown
## YYYY-MM-DD

- Learned: [Something specific]
- Pattern: [Pattern to remember]
- Gotcha: [Something to avoid]

=== LESSON ===
```

### preferences.md

```markdown
## Working Style
- [Preference 1]
- [Preference 2]

## Communication
- [How you report]
- [When to ask vs just do]
```

---

## Optional Files

### errors.md

```markdown
## Mistakes

### Mistake: [Title]

**What:** [What went wrong]
**Fix:** [How to avoid]
**Context:** [When it happens]
```

### qc.md

```markdown
## Quality Rules

- [Rule 1]
- [Rule 2]
```

### audit.md

```markdown
## History

### YYYY-MM-DD: [Action]
- [What happened]
```

---

## System Files (DONT TOUCH)

| File | What |
|------|------|
| `meta.json` | Brain version |
| `_succession.json` | Trust level |
| `.ledger.json` | History |

---

## Quick: Start a New Brain

> **IMPORTANT:** You have a choice for where to store your brain files:

### Option A: Your Private Brain (Recommended)
Create `models/private/` - this is your personal brain that won't be affected by Vant updates.

### Option B: Shared/Public Brain  
Create `models/public/` - shared brain that gets updated with Vant. Agents can also write to this if you want to share with them.

1. Create folder: `models/private/` (or `models/public/`)

2. Create `identity.md` with your name

3. Create `goals.md` with "Just started"

4. Create `lessons.md` with empty

5. Commit and push

---

## Related

- [Brain](essential/brain) - Brain layout
- [Getting Started/getting-started/index) - Getting started

## Next

- [Onboard](essential/onboard) - Onboarding