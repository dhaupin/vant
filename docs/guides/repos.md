---
version: 0.8.6
permalink: /guides/repos
layout: default
title: Multi-Repo Skills
42
---

# Vant Multi-Repo

> Distributed brain - mount repos like drives

```
┌─────────────────────────────────────────────────────┐
│           Multi-Repo Architecture                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ GitHub   │  │Herbalism │  │  VESC   │        │
│  │  Repo   │  │  Repo    │  │  Repo   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│       │              │              │                │
│       └──────────────┼──────────────┘                │
│                    ▼                             │
│              Brain Mount                          │
└─────────────────────────────────────────────────────┘
```

## What Is Multi-Repo?

Pull skills from different repos:
- GitHub Automation skills
- Herbalism/Foraging data
- VESC configs
- Team knowledge bases

### Why

- **Modular skills** - Each repo is a skill domain
- **Team sharing** - Share repo with team
- **Updates** - Pull latest without redeploy

## Default Repos

| Repo | What | Trigger |
|------|------|---------|
| github | GitHub API skills | github, pr, issue |
| herbalism | Plant/herb data | herb, plant |
| vesc | Electric skate configs | vesc, motor |

## Usage

### Register Repo

```javascript
const repos = require('./lib/storage').get('repos');

// Register external repo
repos.register('my-skills', 'https://github.com/user/skills-repo', {
    type: 'skills',
    domain: 'github'
});
```

### Mount

```javascript
// Mount for use
await repos.mount('my-skills');

// Check if mounted
repos.has('my-skills'); // true
```

### Use Skills

```javascript
// Auto-load when triggered
const result = await vant.think('Create a GitHub PR');
// → loads github repo automatically
```

### Pull Updates

```javascript
// Pull latest
await repos.pull('my-skills');

// Pull all
await repos.pull();
```

## CLI

```bash
# List repos
vant repos --list

# Add repo
vant repos add my-skills https://github.com/user/skills-repo

# Remove repo
vant repos remove my-skills

# Pull updates
vant repos pull
```

