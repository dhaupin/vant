---
version: 0.8.6
permalink: /guides/manual-brain
layout: default
title: Brain File Templates
nav_order: 14
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

1. Create folder: `models/public/`

2. Create `identity.md` with your name

3. Create `goals.md` with "Just started"

4. Create `lessons.md` with empty

5. Commit and push

---

## See Also

- [Brain Structure](guides/brain)
- [AI Onboarding](guides/ai-onboard)
