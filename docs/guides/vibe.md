---
version: 0.8.6
permalink: /guides/vibe
layout: default
title: Vibe Controls
nav_order: 16
---

# Vant Vibe Controls

> Dynamic mood system for AI runtime

## What Is Vibe?

Vibe formalizes how "mood" influences runtime.
The agent can programmatically rewrite its own `mood.ini`.

## Available Vibes

| Vibe | Risk | Creativity | When |
|------|------|------------|-------|
| experimental | high | high | Trying new things |
| safety_first | low | medium | Conservative, verify first |
| focused | medium | medium | Deep work |
| learning | high | high | Exploring |
| debugging | low | low | Fixing issues |
| review | low | medium | Analyzing |

## Usage

```javascript
const vibe = require('./lib/vibe');

// Get current
vibe.getMood(); // 'experimental'

// Set
vibe.setMood('safety_first');

// Auto-adjust on outcome
vibe.onTaskSuccess(); // debugging → review
vibe.onTaskError();   // → safety_first

// For git commits
vibe.getCommitVibe(); // '[vibe:experimental risk=high]'
```

## CLI

```bash
vant vibe              # Show current
vant vibe experimental # Set
vant vibe --list      # List all
vant vibe --commit   # Get commit string
```

## Integration

Use in your agent:

```javascript
// After critical error
vibe.onTaskError();

// After successful debugging
vibe.onTaskSuccess();

// In commit messages
const commitMsg = `Fixed issue #123
${vibe.getCommitVibe()}`;
```

---

## Related

- [Islands](islands) - Componentized brain
- [Schema](schema) - JSON validation
- [Testing](testing) - Quality assurance