---
version: 0.8.11
permalink: /tutorials/custom-island
layout: default
title: Custom Islands
nav_order: 7
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

### Step 1: Define Island

Create a new brain category as an island:

```javascript
const islands = require('./lib/islands');

// Define new island
islands.define({
    name: 'herbalism',
    triggers: ['herb', 'plant', 'medicine'],
    load: async () => {
        // Load from brain
        return await brain.get('skills', 'herbalism');
    }
});
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

Now when you use triggers:

```javascript
// Think about herbs - island auto-loads
const result = await vant.think('What herbs help with sleep?');

// Island auto-hydrates
console.log(result.islands);
// [{ name: 'herbalism', loaded: true }]
```

## Programmatic Load

Manual island loading:

```javascript
// Load specific island
const data = await islands.load('github');

// Load all
const all = await islands.loadAll();
```

## Island Manifest

Save island configuration:

```javascript
// Save to manifest
islands.saveManifest({
    version: '1.0',
    islands: {
        herbalism: {
            triggers: ['herb', 'plant'],
            autoLoad: false
        }
    }
});
```

## Multi-Trigger Islands

One island, multiple triggers:

```javascript
islands.define({
    name: 'database',
    triggers: ['sql', 'postgres', 'mysql', 'database', 'db'],
    load: async () => {
        return await brain.get('skills', 'database');
    }
});
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

## See Also

- [Islands Guide](/guides/islands)
- [Runtime API](/guides/runtime)
- [Search](/guides/search)