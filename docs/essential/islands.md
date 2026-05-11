---
version: 0.8.6
permalink: /guides/islands
layout: default
title: Islands - Lazy-loading
nav_order: 8
4
---

# Vant Islands

Implements Prestruct's "Islands of Interactivity" for AI memory. Each skill/knowledge block is a lazy-loadable "island."

## The Problem

Vant used to load one giant `current.json` - potentially massive, containing everything.

## The Solution

**Componentized Brain** - Split into islands:
- **Static Islands**: Identity, learnings, decisions (always loaded)
- **Lazy Islands**: GitHub, Herbalism, VESC, etc (on trigger)

## Architecture

```
Brain = Static Islands + Hydrated Islands + Gallery

Static (always):
  - identity   (who I am)
  - learnings  (knowledge)
  - decisions  (reasoning)

Lazy (on trigger):
  - github     → trigger: "github", "pr", "issue"
  - herbalism → trigger: "herb", "plant"  
  - vesc       → trigger: "vesc", "motor"
  - linear     → trigger: "linear", "project"
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

- [Vibe Controls](vibe) - Dynamic mood system
- [Hybrid Sync](hybrid) - Public/Private brain split
- [Multi-Repo](repos) - Mount external repos

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