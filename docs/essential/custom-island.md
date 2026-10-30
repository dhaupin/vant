---
version: 0.8.6
permalink: /essential/custom-island
layout: default
title: Custom Islands
description: Write your own island - the load-trigger contract for lazily-loaded brain modules.
nav_order: 41
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

Vant comes with built-in islands (`DEFAULT_ISLANDS` in `lib/islands.js`):

| Island | Type | Triggers |
|--------|------|---------|
| identity | static (always) | - |
| learnings | static (always) | - |
| decisions | static (always) | - |
| github | lazy | "github", "pr", "issue", "push", "repo", "commit", "branch" |
| gitlab | lazy | "gitlab", "merge", "mr" |
| bitbucket | lazy | "bitbucket" |
| linear | lazy | "linear", "project", "issue", "tracker" |
| trust | lazy | "trust", "reputation", "score" |
| market | lazy | "market", "trade", "listing", "bid" |
| evolution | lazy | "evolution", "session", "insight", "learning" |

## Create Custom Island

### Step 1: Extend Islands

The no-fork path is `vant.islands.createIsland(name, { type, triggers })` (shown under [Island Manifest](#island-manifest) below); editing `DEFAULT_ISLANDS` in `lib/islands.js` is the fork-and-ship alternative:

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

Islands live in a manifest (`islands.json` under the brain root) merged over `DEFAULT_ISLANDS` at load time. The public way to add one is `createIsland` - it validates, registers the definition, and stamps a brain file for static islands:

```javascript
const vant = require('vant');

vant.islands.createIsland('herbalism', {
    type: 'lazy',
    triggers: ['herb', 'plant']
});
// → { name: 'herbalism', type: 'lazy', triggers: ['herb', 'plant'] }

// Triggers are adjustable later
vant.islands.updateTriggers('herbalism', ['herb', 'plant', 'medicine']);
```

(There is no exported `saveManifest` - `save(name, data)` persists island DATA into the registered island's storage slot.)

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

- [Islands Guide](/vant/essential/islands)
- [Runtime API](/vant/runtime/runtime)
- [Search](/vant/memory/search)