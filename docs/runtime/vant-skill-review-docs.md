---
version: 0.8.11
permalink: /essential/vant-skill-review-docs.md
layout: default
title: Skill Review docs
nav_order: 144
---

# Docs Review

> Does this make sense?

---

## Read Like An AI

Agents don't ask questions. They read and act.

**Question**: Can an AI understand this without human help?

---

## What To Check

### 1. Clear Purpose

```markdown
# What's this about?
## This does X
```

| Check | Issue |
|-------|-------|
| No header | Can't find topic |
| Vague header | Can't understand |
| No summary | Can't trust |

### 2. Codeblocks

Every codeblock needs:

```javascript
// What it does
const x = doThing()
```

| Check | Issue |
|-------|-------|
| No explanation | Can't use |
| Wrong language | Can't run |
| Outdated | Won't work |

### 3. Examples

```markdown
# Example
```bash
npm install vant
```

| Check | Issue |
|-------|-------|
| No examples | Can't try |
| Wrong command | Won't work |
| Partial | Confusing |

### 4. Structure

```markdown
## Step 1
## Step 2
## Step 3
```

| Check | Issue |
|-------|-------|
| No steps | Can't follow |
| Wrong order | Confusing |
| Missing steps | Stuck |

---

## AI-First Test

Try explaining to another AI:

> "Read this doc and do the thing. Tell me what you'd need to know."

If they can't do it, fix the doc.

---

## Output

```
## Docs Review - [file]

### Purpose
- [CLEAR/VAGUE] Header: [text]

### Codeblocks
- [OK/MISSING] [count] codeblocks explained

### Examples
- [OK/MISSING] Examples work

### Structure
- [OK/ROUGH] Walkthrough complete
```

---

**Role**: Docs Reviewer  
**Input**: Documentation  
**Output**: AI-readable?