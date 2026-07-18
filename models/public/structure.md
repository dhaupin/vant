# Structure

How brain files are organized.

---

## Naming

| Type | Pattern | Example |
|------|---------|---------|
| Concept | noun.md | identity.md |
| Action | gerund.md | learning.md |
| State | noun.md | goals.md |
| Pattern | noun.md | patterns.md |

---

## Sections

### Major: ##

Use for major sections:
- WAKE UP
- LOOP
- OUTPUT
- DECIDE

### Sub: ###

Use for sub-sections:
- ### Understand
- ### Execute
- ### Record

### Pattern: ####

Use for reusable patterns:
- #### Decision
- #### Output

---

## Content Chunks

### One Idea Per Paragraph

Good:
```
## Decision

### Time
- Est: 5 min
```

Avoid:
```
## Decision involves time estimation which is the first step of the decision process and takes about 5 minutes typically
```

### Lists for Multiple Items

```
### CAN Decide
- Edit files
- Run commands
- API calls
```

### Tables for Mappings

```
| Time | Risk | Action |
|------|------|--------|
| <5m | none | DO IT |
```

---

## Headings Are Retrieval

| Heading = | Use |
|-----------|-----|
| ## | Major section |
| ### | Sub topic |
| #### | Pattern/example |

---

## Code Blocks

Use for:
- Commands to run
- Config to copy
- Examples

```bash
# Commands
cat models/public/start.md
```

---

## Crosslinks

Format:
```
[filename.md](../../models/public/filename.md)
```

With label:
```
[filename.md](../../models/public/filename.md) - WHAT
```

---

## AI-First Structure

### For Retrieval

1. Put key info in headings
2. Use tables for decisions
3. Lists for options
4. Code for commands

### For Understanding

1. One concept per section
2. Examples in blocks
3. Crosslinks to related

---

**See also:**
- [clarity.md](./clarity.md) - Clear structure
- [architecture.md](./architecture.md) - Technical structure