---
version: 0.8.6
permalink: /guides/hybrid
layout: default
title: Hybrid Sync
nav_order: 34
25
---

# Vant Hybrid Sync

> Public/Private brain - split sync

```
┌─────────────────────────────────────────────────────┐
│           Hybrid Sync Architecture                  │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │              Brain                          │   │
│  │                                             │   │
│  │  Public (logs)  ────────▶ Public repo      │   │
│  │       │                                    │   │
│  │  Private (keys) ──────▶ Private repo      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## What Is Hybrid?

Sync different parts to different repos:
- Sensitive state → private repo
- Public logs/summaries → public repo

## Why

- **Privacy** - Keep secrets separate
- **Sharing** - Publish without expose
- **Compliance** - Data region requirements

## Usage

### Configure Privacy

```javascript
const hybrid = require('./lib/hybrid');

// Set repo privacy
hybrid.setPrivacy('github', 'private');
hybrid.setPrivacy('logs', 'public');
hybrid.setPrivacy('identity', 'private');
```

### Push

```javascript
// Push to specific
await hybrid.pushPublic();   // Only public repos
await hybrid.pushPrivate();  // Only private repos
await hybrid.pushAll();      // Both
```

### Get Summary

```javascript
hybrid.getSummary();
// { defaultPrivacy: 'private', publicRepos: [], privateRepos: [] }
```

## CLI

```bash
vant hybrid-sync                # Summary
vant hybrid-sync --public     # Push to public
vant hybrid-sync --private    # Push to private
vant hybrid-sync --set github private
```

## Use Cases

| Data | Privacy | Why |
|------|---------|------|
| identity | private | PII |
| learnings | private | IP |
| decisions | private | Strategy |
| logs | public | Sharing |
| summaries | public | Team sync |
|------|----------|