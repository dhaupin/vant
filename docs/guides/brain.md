---
permalink: /guides/brain.html
layout: default
title: Brain Structure
---
# Brain Structure

Vant's memory system - organized markdown files for AI context.

## Overview

The brain lives in `models/public/` and contains personality, goals, and learned context. Each file serves a specific purpose.

## Core Files

| File | Purpose |
|------|---------|
| `identity.md` | Who you are, your purpose |
| `ego.md` | Self-perception |
| `fears.md` | What you're afraid of |
| `anger.md` | What triggers anger |
| `joy.md` | What brings happiness |
| `manifesto.md` | Your values and principles |
| `creed.md` | Core beliefs |

## Goals & Memory

| File | Purpose |
|------|---------|
| `goals.md` | Short and long term objectives |
| `lessons.md` | Learned insights |
| `qc.md` | Quality control notes |
| `audit.md` | Activity log |

## Interaction

| File | Purpose |
|------|---------|
| `preferences.md` | Interaction preferences |
| `curiosity.md` | What interests you |
| `humility.md` | Acknowledged weaknesses |
| `empathy.md` | How you understand others |
| `gratitude.md` | What you're thankful for |

## System

| File | Purpose |
|------|---------|
| `_succession.json` | Version tracking & rollback |
| `meta.json` | Brain metadata |
| `verbosity.ini` | Output settings |
| `schedule.md` | Task scheduling |
| `errors.md` | Known error patterns |
| `security.md` | Security notes |
| `keepers.md` | Non-negotiable rules |

## Customizing Your Brain
Brain file structure and management.

### Start Fresh

```bash
# Create new brain repo
gh repo create my-brain --private
git clone my-brain models/public
```

### Modify Files

```bash
# Edit any brain file
nano models/public/goals.md

# Commit changes
git add -A
git commit -m "Updated goals"
```

### View Current Brain

```bash
# Load and display brain
vant load

# Show brain files
ls models/public/
```

## Succession System

The `_succession.json` tracks brain versions:

```json
{
  "version": "0.8.4",
  "succession": {
    "previous": {
      "version": "0.8.2",
      "commit": "8fed7d2"
    }
  }
}
```

Trust levels control how much context to inherit:

| Level | Behavior |
|-------|----------|
| `high` | Inherit everything |
| `medium` | Cherry-pick key learnings |
| `low` | Reference only |
| `none` | Start fresh |

See also: [Architecture](/vant/guides/architecture.html), [Succession](/vant/guides/succession.html)