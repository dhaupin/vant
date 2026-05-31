---
version: 0.8.11
permalink: /tutorials/custom-island
layout: default
title: Custom Islands
nav_order: 22
---

# Tutorial: Create Custom Islands

> 10-minute tutorial to create custom islands for your brain

## What You'll Build

Custom islands that load on-demand when triggered.

## Why Islands?

Islands let you lazy-load brain components:
- Only load what's needed
- Reduce memory usage
- Organize by topic/skill

## Default Islands

Vant comes with built-in islands:

| Island | Triggers |
|--------|---------|
| identity | always |
| learnings | always |
| decisions | always |
| github | "github", "pr", "issue" |
| gitlab | "gitlab", "merge" |
| bitbucket | "bitbucket" |
| linear | "linear", "project" |
| automation | "cron", "schedule" |

## Create Custom Island

### Step 1: Extend Islands

Add new islands by editing `DEFAULT_ISLANDS` in `lib/islands.js`:

```javascript
const DEFAULT_ISLANDS = {
    // ... existing islands ...
    herbalism: { 
        name: 'Herbalism', 
        type: 'lazy', 
        triggers: ['herb', 'plant', 'medicine'] 
    },
    // Add more...
};
```

**Runtime API**

```javascript
const vant = require('vant');

// Get available islands
const available = vant.islands.getAvailable();
// ['identity', 'learnings', 'decisions', 'github', 'gitlab', ...]

// Find triggers in prompt
const triggers = vant.islands.findTriggers('What herbs help with sleep?');
// ['herb', 'plant']

// Auto-hydrate from prompt
await vant.islands.autoHydrate('I need to work with GitHub PRs');
```

### Step 2: Add Content

Add content to your brain:

```markdown
# skills/herbalism.md

## Teas
- Chamomile: sleep, anxiety
- Peppermint: digestion, headaches
- Ginger: nausea, inflammation

## Tinctures
- Echinacea: immune support
- Valerian: sleep
```

### Step 3: Trigger Usage

```javascript
const vant = require('vant');

// Think about herbs - auto-hydrates island
const result = await vant.islands.autoHydrate('What herbs help with sleep?');

// Check hydrated islands
console.log(vant.islands.getHydrated());
// [{ name: 'herbalism', loaded: true }]
```

## Programmatic Load

```javascript
// Load specific island (get data)
const data = await vant.islands.load('github');

// Load + track as hydrated
await vant.islands.hydrate('github');

// Get all available islands
const all = vant.islands.getAvailable();
```

## Island Manifest

Save island configuration to `islands.json`:

```javascript
const vant = require('vant');

vant.islands.saveManifest({
    version: '1.0',
    islands: {
        herbalism: {
            name: 'Herbalism',
            triggers: ['herb', 'plant'],
            autoLoad: false
        }
    }
});
```

## Multi-Trigger Islands

Add more triggers in `DEFAULT_ISLANDS`:

```javascript
const DEFAULT_ISLANDS = {
    // ... existing islands ...
    database: { 
        name: 'Database', 
        type: 'lazy', 
        triggers: ['sql', 'postgres', 'mysql', 'database', 'db'] 
    },
};
```

## Use Cases

### Skills Island

```markdown
# skills/python.md
# skills/javascript.md
# skills/docker.md
```

Tools you've learned, triggers on tool names:

```javascript
const result = await vant.think('How do I use Docker?');
// → Loads python island, then docker island
```

### Project Island

```markdown
# projects/myapp.md
```

Project context, triggers on project name:

```javascript
const result = await vant.think('Update myapp');
// → Loads myapp project island
```

### Client Island

```markdown
# clients/acme.md
```

Client context, triggers on client name:

```javascript
const result = await vant.think('Contact acme about invoice');
// → Loads acme client island
```

---

## Related

- [Islands Guide](essential/islands)
- [Runtime API](essential/runtime)
- [Search](advanced/search)