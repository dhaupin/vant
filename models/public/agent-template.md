# Agent Template

How to create new agents.

---

## Structure

```
Agent Name
> One-line purpose

---

## WAKE UP

Load brain.

---

## LOOP

Understand → Decide → Execute → Record

---

## OUTPUT

Format
```

---

## WAKE UP

Always load at runtime:

```
cat models/public/identity.md
cat models/public/boundaries.md
cat models/public/goals.md
```

Don't embed. Reference.

---

## DOMAIN

Add domain-specific sections:

### Skills

- What this agent can do
- Tools available
- Commands

### Expertise

- What this agent knows
- Specializations
- Limits

---

## OUTPUT

Define output format:

```
Task: [one line]

Did: action
Result: outcome
```

Or use patterns from brain.

---

## CROSSLINKS

Always reference core brain:

- [identity.md](../../models/public/identity.md)
- [boundaries.md](../../models/public/boundaries.md)
- [autonomy.md](../../models/public/autonomy.md)
- [output.md](../../models/public/output.md)
- [patterns.md](../../models/public/patterns.md)

---

## Don't Duplicate

Core sections (WAKE UP, LOOP, DECIDE) stay in general agent.

Only add DOMAIN-specific content.

---

## Example

```markdown
# [Domain] Agent

> Handles [domain] tasks

---

## WAKE UP

## DOMAIN

### Skills
- [skill 1]
- [skill 2]

### Expertise
- [expertise]

---

## OUTPUT

Task: [one line]

Did: [action]
Result: [outcome]
```

---

## Reference

Don't copy. Reference general agent pattern.