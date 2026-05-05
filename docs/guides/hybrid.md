---
version: 0.8.6
permalink: /guides/hybrid.html
layout: default
title: Hybrid Sync
nav_order: 14
---

# Vant Hybrid Sync

> Public/Private brain - split sync

> **Related**: [Islands](islands) | [Multi-Repo](repos) | [Sync](sync)

## What Is Hybrid?

Sync different parts to different repos:
- Sensitive state → private repo
- Public logs/summaries → public repo

## Usage

```javascript
const hybrid = require('./lib/hybrid');

// Set repo privacy
hybrid.setPrivacy('github', 'private');
hybrid.setPrivacy('logs', 'public');

// Push to specific
await hybrid.pushPublic();   // Only public repos
await hybrid.pushPrivate();  // Only private repos
await hybrid.pushAll();     // Both

// Get summary
hybrid.getSummary();
// { defaultPrivacy: 'private', publicRepos: [], privateRepos: [] }
```

## CLI

```bash
vant hybrid                # Summary
vant hybrid --public     # Push to public
vant hybrid --private    # Push to private
vant hybrid --set github private
```

## Use Cases

| Data | Privacy |
|------|----------|
| Identity | private |
| Learnings | private |
| Error logs | public |
| Weekly summaries | public |

## With Multi-Repo

```javascript
const repos = require('./lib/repos');
const hybrid = require('./lib/hybrid');

// Mount skills (public)
repos.register('skills', 'https://github.com/user/skills');
hybrid.setPrivacy('skills', 'public');

// Mount sensitive (private)
repos.register('internal', 'https://github.com/user/internal');
hybrid.setPrivacy('internal', 'private');
```