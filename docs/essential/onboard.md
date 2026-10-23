---
version: 0.8.6
permalink: /essential/onboard
layout: default
title: Knowledge Base Browser
description: vant onboard - interactively browse every brain file an island can load.
nav_order: 39
---
# Knowledge Base Browser

Browse and search your Vant brain.

```text
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

### Non-Interactive Verbs

The routed `onboard` command exposes a small verb set (verified on the
real CLI): `status`, `wake`, `summary`, `files`, `read <file>`,
`search <term>`, `system`, `help`.

```bash
# Install state + brain summary + next steps (the wake loop anchor)
vant onboard status

# Start-of-session ceremony
vant onboard wake

# One-screen session stats
vant onboard summary

# List + read brain files
vant onboard files
vant onboard read identity.md

# Full-text search across the brain (matches filenames + content)
vant onboard search goals

# Diagnostics + verb help
vant onboard system
vant onboard help
```

For interactive browsing use `vant onboard` bare (the browser)
or `cat` brain files directly:

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

### Search

```bash
# Full-text search across the brain
vant onboard search "authentication"

# Try a second term
vant onboard search "python"
```

Results list matching brain files with their titles (filename match
and content match, one line each). For scored hybrid/RAG search use
`vant search` instead (see [Search](/vant/memory/search)).

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
vant onboard search "python"

# See what you've learned
cat models/private/vant/lessons.md
```

### Review Work

```bash
# Review the session summary
vant onboard summary

# Review decisions
cat models/private/vant/decisions.md
```

## CLI Quick

```bash
# One-liner
cat models/private/vant/identity.md
```

---

## Related

- [Brain](/vant/memory/brain) - Brain structure
- [Getting Started/getting-started/index) - Getting started guide
- [Hybrid Search](/vant/integrations/hybrid) - Hybrid search

## Next

- [Islands](/vant/essential/islands) - Lazy-loading integrations