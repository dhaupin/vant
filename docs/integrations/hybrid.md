---
version: 0.8.6
permalink: /integrations/hybrid
layout: default
title: Hybrid Sync
nav_order: 87
---

# Vant Hybrid Sync

> Public/Private brain - split sync

```text
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
- Sensitive state -> private repo
- Public logs/summaries -> public repo

## Why

- **Privacy** - Keep secrets separate
- **Sharing** - Publish without expose
- **Compliance** - Data region requirements

## Usage

### Configure Privacy

```javascript
const hybrid = require('vant').hybrid;

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
vant hybrid                     # Summary
vant hybrid --public            # Push to public
vant hybrid --private           # Push to private
vant hybrid --set github private  # Set a repo's privacy
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