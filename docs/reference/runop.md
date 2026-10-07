---
version: 0.8.6
permalink: /reference/runop
layout: default
title: Runop API
nav_order: 129
description: The runtime operator - init, run, and stop the middleware pipeline. Absorbed into lib/pipeline.js.
---

# Runop API

The runtime operator initializes, runs, and stops the middleware pipeline.
It was absorbed into `lib/pipeline.js` (there is no `lib/runop.js`), and
the same surface fronts the `vant runop` CLI.

## CLI

```bash
vant runop init      # Initialize runtime layers
vant runop start     # Alias for init
vant runop status    # Pipeline status (modes, handlers)
vant runop stop      # Stop the runtime
```

## Functions

| Function | What |
|----------|------|
| `initLayers(opts)` | Initialize runtime layers |
| `runtimeRun(operation, options)` | Run an operation through the runtime |
| `runtimeStop(options)` | Stop the runtime |
| `runtimeStatus()` | Runtime status |
| `getStatus()` | Middleware status (name, version, modes, handlers) |

## Usage

```javascript
const pipeline = require('vant/lib/pipeline');

await pipeline.initLayers({ debug: true });
const status = pipeline.getStatus();
```

## Related

- [Runtime API](/vant/reference/api-runtime) - the full runtime surface
