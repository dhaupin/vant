---
version: 0.8.6
permalink: /guides/repos
layout: default
title: Multi-Repo Skills
nav_order: 19
---

# Vant Multi-Repo

> Distributed brain - mount repos like drives

## What Is Multi-Repo?

Pull skills from different repos:
- GitHub Automation skills
- Herbalism/Foraging data
- VESC configs

## Default Repos

- `github` - GitHub skills
- `herbalism` - Herbalism data  
- `vesc` - VESC configs

## Usage

```javascript
const repos = require('./lib/repos');

// Register external repo
repos.register('my-skills', 'https://github.com/user/skills-repo', {
    type: 'skills',
    domain: 'github'
});

// Mount for use
await repos.mount('my-skills');

// Pull updates
await repos.pull();

// Check if mounted
repos.has('my-skills'); // true
```

## CLI

```bash
vant repos --list           # List repos
vant repos --mount github  # Mount
vant repos --pull          # Pull all mounted
vant repos --register myskills https://github.com/user/repo
```

## Workflow

1. **Register** skill repo
2. **Mount** when needed
3. **Pull** updates on demand
4. Use mounted files in tasks

## Privacy

Use with Hybrid sync:

```javascript
const hybrid = require('./lib/hybrid');
hybrid.setPrivacy('my-skills', 'public'); // or 'private'
```

---

## Related

- [Islands](islands) - Componentized brain
- [Hybrid Sync](hybrid) - Public/Private split
- [Providers](providers) - Multi-git provider