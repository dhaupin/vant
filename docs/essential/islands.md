---
version: 0.8.6
permalink: /essential/islands
layout: default
title: Islands - Lazy-loading
nav_order: 4
---

# Vant Islands

Implements Prestruct's "Islands of Interactivity" for AI memory. Each skill/knowledge block is a lazy-loadable "island."

## The Problem

Vant used to load one giant `current.json` - potentially massive, containing everything.

## The Solution

**Componentized Brain** - Split into islands:
- **Static Islands** (3): Identity, Learnings, Decisions (always loaded)
- **Lazy Islands** (7): GitHub, GitLab, Bitbucket, Linear, Herbalism, VESC, Automation

## Architecture

```
Brain = Static Islands + Lazy Islands

Static (always, 3):
  - identity   (who I am)
  - learnings  (knowledge)
  - decisions  (reasoning)

Lazy (on trigger, 7):
  - github     → trigger: "github", "pr", "issue", "repo"
  - gitlab     → trigger: "gitlab", "mr"
  - bitbucket → trigger: "bitbucket"
  - linear    → trigger: "linear", "project", "issue"
  - herbalism → trigger: "herb", "plant"
  - vesc       → trigger: "vesc", "motor"
  - automation → trigger: "automation", "webhook"
```

## CLI Usage

```bash
# List all islands
vant islands --list

# Auto-hydrate based on prompt
vant islands --prompt "fix github pr"

# Hydrate specific island
vant islands --island github
```

## API Usage

```javascript
const islands = require('./lib/islands');
const state = require('./lib/storage').get('state');

// Find islands that match a trigger
const found = islands.findTriggers('github issue');
// ['github']

// Auto-hydrate based on prompt
const toLoad = islands.autoHydrate('fix the pr in github');
// ['identity', 'learnings', 'decisions', 'github']

// Hydrate one island
await islands.hydrate('github');
```

## State Separation

```javascript
const state = require('./lib/storage').get('state');

// Static: Immutable (identity, facts)
state.setStatic({ name: 'Vant', version: '0.8.6' });

// Current: Active task
state.setCurrent({ task: 'fix bug', target: 'github' });

// Temp: Temporary variables (wiped on prune)
state.setTemp({ cache: {}, debug: {} });
```

## Gallery (Stego Images)

Each island can be its own stego PNG:

```javascript
const gallery = require('./lib/gallery');

// Save island as image
gallery.saveImage('github', pngBuffer);

// Load island image
const img = gallery.loadImage('github');

// Link to brain
gallery.linkToBrain();
```

## The Win

| Before | After |
|--------|-------|
| Load entire current.json | Load only needed islands |
| ~full brain size | ~identity + triggers only |
| All skills loaded | Lazy on use |

## Trigger Mapping

| Trigger Word | Island |
|--------------|--------|
| github, pr, issue, repo | github |
| gitlab, merge | gitlab |
| bitbucket | bitbucket |
| herb, plant, medicine | herbalism |
| vesc, skateboard, motor | vesc |
| linear, project | linear |
| cron, automation | automation |

## Files

- `lib/islands.js` - Island registry + lazy loader
- `lib/state.js` - Static/Hydrated state separation
- `lib/gallery.js` - Linked stego image chunks
- `bin/islands-boot.js` - Islands boot CLI

---

## Related

- - Dynamic mood system
- - Public/Private brain split
- - Mount external repos

---

## Custom Islands

Create your own island:

```javascript
const islands = require('./lib/islands');

islands.define({
    name: 'myskills',
    triggers: ['python', 'docker', 'kubernetes'],
    load: async () => {
        return await brain.get('skills', 'myskills');
    }
});
```

Then use:

```javascript
const result = await vant.think('How do I use Docker?');
// → auto-loads python island when "Docker" detected
```

See [Tutorial: Custom Islands](/tutorials/custom-island) for full guide.