---
version: 0.8.7
permalink: /reference/runop
layout: default
title: Runop API
nav_order: 89
---

# Runop API

Runtime operator - manages agent lifecycle.

## Functions

| Function | What |
|----------|------|
| `init(opts)` | Initialize runtime |
| `run()` | Start runtime |
| `stop()` | Stop runtime |
| `getStatus()` | Get status |

## Usage

```javascript
const runop = require('vant/lib/runop');

await runop.init({ name: 'agent' });
await runop.run();

// Later
await runop.stop();
```