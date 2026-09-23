---
version: 0.8.6
permalink: /multi-agent/brains
layout: default
title: Multi-brain
nav_order: 46
description: Named brains with a stack - several memory contexts in one install, switched by name.
---

# Multi-brain

> Several named brains in one install. Switch by name, series or parallel.

Since the multibrain layout, every brain lives in a per-brain directory in
both scopes, and `models/state.json` holds the active stack:

```text
models/
  public/vant/
  public/nova/
  private/vant/
  private/nova/
  state.json            { "stack": ["nova", "vant"], ... }
```

The stack is ordered. The loader checks the current brain first and falls
back through the stack, so a shared template brain can sit underneath a
project brain.

## Working with brains

The runtime API switches and manages brains:

```javascript
const brain = require('./lib/brain');

brain.setMode('dual');        // 'dual' | 'public' | 'private' | 'remote'
brain.getBrainPath();          // current private brain path
brain.getPublicPath();         // current public brain path
```

Dual mode reads check the current brain's root first, then the public root.
Pin a scope to skip the fallback:

```javascript
const item = await brain.read('identity');               // dual, with fallback
const pub  = await brain.read('identity', { type: 'public' });   // public only
const priv = await brain.read('notes', { type: 'private' });     // private only
```

## Imports and naming

A legacy single-brain tree imports as one named brain covering both scopes:

```bash
vant migrate --brain-name nova
```

Names are segment-validated. Migration is content-detected and idempotent;
the [migration guide](/vant/getting-started/setup) has the full contract.

## Agents per brain

Agent rosters and configs scope per brain, with stack traversal for shared
config. The agent crew workflow is in [Agents](/vant/multi-agent/agents).
