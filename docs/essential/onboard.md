---
version: 0.8.6
permalink: /essential/onboard
layout: default
title: Knowledge Base Browser
nav_order: 13
---
# Knowledge Base Browser

Browse and search your Vant brain.

```
┌─────────────────────────────────────────────┐
│          Vant Onboard CLI                     │
│                                              │
│  $ vant onboard                              │
│  ════════════════════                        │
│                                              │
│  1. identity.md                             │
│  2. goals.md                                │
│  3. lessons.md                              │
│  4. style.md           [preview]            │
│  5. rules.md                                │
│                                              │
│  > _                                        │
└─────────────────────────────────────────────┘
```

## What It Does

Onboard provides:
- Interactive brain browser
- Search across all files
- Read content with preview
- Navigate by category
- Find related learnings

## Why

When you wake up (start a session):
- Read identity to know who you are
- Read goals to know what to do
- Read lessons to learn from past you

## Running

### Interactive Browse

```bash
# Start browser
vant onboard

# Select file by number
vant onboard 1

# Select by name
vant onboard identity
```

### Query Mode

```bash
# Search brain
vant onboard --search "goals"

# Search with category
vant onboard --search "learn" learnings

# Search with context
vant onboard --context "search term"
```

### Preview Mode

```bash
# Preview file (no enter)
vant onboard --preview identity

# Preview multiple
vant onboard --preview identity --preview goals
```

## Interactive Commands

In browse mode:

| Command | What |
|---------|------|
| 1-5 | Select file |
| /search | Search brain |
| /all | Show all files |
| /category | Filter by category |
| /back | Go back |
| /quit | Exit |

## Files

### Core Files

Must read when starting:

| File | Importance | What It Tells You |
|------|------------|------------------|
| identity.md | Critical | Who you are |
| goals.md | Critical | What to do |
| lessons.md | High | What you've learned |
| preferences.md | Medium | How you like to work |
| boundaries.md | High | What you won't do |

### Category Files

| Category | What |
|----------|------|
| identity/ | Who you are |
| goals/ | What you're working on |
| learnings/ | What you've learned |
| decisions/ | Important decisions |
| style/ | Your preferences |

## Search

### Search Examples

```bash
# Find all files with "authentication"
vant onboard --search "authentication"

# Find in learnings category
vant onboard --search "python" learnings

# Find recent (last 7 days)
vant onboard --recent
```

### Search Results

Results show:
- File path
- Relevance score
- Content preview
- Last updated

## Use Cases

### New Session

```bash
# When you wake up
vant onboard

# 1. Read identity
# 2. Read goals
# 3. Start working
```

### Find Something

```bash
# "What do I know about X?"
vant onboard --search "python"

# See what you've learned
```

### Review Work

```bash
# Review recent learnings
vant onboard --recent

# Review decisions
vant onboard decisions
```

## CLI Quick

```bash
# One-liner
cat models/public/identity.md
```

---

## Related

- - Brain structure
- - Getting started
- - Hybrid search