---

version: 0.8.6
permalink: /advanced/vibe
layout: default
title: Vibe Controls

nav_order: 78
---


# Vant Vibe Controls

> Dynamic mood system for AI runtime

## What Is Vibe?

Vibe formalizes how "mood" influences runtime. The agent programmatically rewrites its own `mood.ini`.

```
┌──────────────────────────────────────────┐
│     Vibe Controls Agent Behavior        │
│                                          │
│  experimental ──▶ safety_first          │
│     ↑↓          ↓↑                      │
│  focused ◀───▶ learning                │
│     ↑↓          ↓↑                      │
│  debugging ←───▶ review                │
└──────────────────────────────────────────┘
```

## Available Vibes

| Vibe | Risk | Creativity | Temperature | When |
|------|------|------------|-------------|------|
| experimental | high | high | 0.9 | Trying new things |
| safety_first | low | medium | 0.5 | Conservative, verify first |
| focused | medium | medium | 0.7 | Deep work |
| learning | high | high | 0.8 | Exploring |
| debugging | low | low | 0.4 | Fixing issues |
| review | low | medium | 0.6 | Analyzing |

### Mood File

Vibes stored in `mood.ini`:

```ini
[mood]
name = focused
risk = medium
creativity = medium
temperature = 0.7

[limits]
max_retries = 3
timeout = 30000
```

## Usage

Get current mood:

```javascript
const vibe = require('./lib/vibe');

console.log(vibe.getMood());
// { name: 'focused', risk: 'medium', creativity: 'medium' }
```

Set mood:

```javascript
vibe.setMood('experimental');
// Vibe changes to experimental
// Risk increases, creativity increases
```

### Auto-Adjust

Automatically adjust on outcomes:

```javascript
// After success - increase confidence
vibe.onTaskSuccess();

// After error - decrease confidence
vibe.onTaskError();

// After timeout - slow down
vibe.onTimeout();
```

### Git Commits

Include vibe in commit messages:

```javascript
const commitMsg = `Fixed authentication issue

${vibe.getCommitVibe()}`;
console.log(commitMsg);
// Fixed authentication issue
// [vibe:focused risk=medium creativity=medium]
```

## Risk Levels

| Level | What | Blocked Actions |
|-------|------|----------------|
| low | Minimal risk | delete, force push, admin |
| medium | Normal risk | None |
| high | Experimental | None |

## Temperature Mapping

| Vibe | Temperature | Use With |
|------|------------|---------|
| experimental | 0.9 | Creative tasks |
| focused | 0.7 | Deep work |
| learning | 0.8 | Exploring code |
| safety_first | 0.5 | Production ops |
| debugging | 0.4 | Bug fixes |
| review | 0.6 | Code review |

## CLI

```bash
# Show current
vant vibe

# Set vibe
vant vibe experimental
vant vibe safety_first

# List all vibes
vant vibe --list

# Get commit string
vant vibe --commit
```

## Integration

Use in your agent loop:

```javascript
const vibe = require('./lib/vibe');

async function runAgent(task) {
    // Start focused
    vibe.setMood('focused');
    
    try {
        const result = await execute(task);
        
        // Success - boost confidence
        vibe.onTaskSuccess();
        return result;
        
    } catch (error) {
        // Error - tone down
        vibe.onTaskError();
        
        if (vibe.getMood().risk === 'low') {
            // Too conservative, switch approach
            vibe.setMood('learning');
        }
        
        throw error;
    }
}
```

## Configuration

Configure vibe options:

```javascript
vibe.configure({
    defaultMood: 'focused',
    autoAdjust: true,
    minRisk: 'low',
    maxRisk: 'high'
});
```

---


## Related

- [Islands](essential/islands) - Componentized brain
- [Schema](reference/schema) - JSON validation
- [Testing](tutorials/testing) - Quality assurance