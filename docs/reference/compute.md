---
version: 0.8.6
permalink: /reference/compute
layout: default
title: Compute API
description: The compute API - sidecar runtimes and language connectors behind one surface.
nav_order: 122
---

# Compute API

Execute code in sandboxed environments. Supports multiple languages.

> Beta v0.8.6

## Languages Supported

Language connectors live in `lib/connectors/` (subprocess per language): python, julia, rust, plus node/ruby/go/php connectors.

## Functions

| Function | What |
|----------|------|
| `invoke(func, args, lang)` | Call a function in a language (default python) |
| `evaluate(code, {lang, timeout})` | Evaluate raw foreign code |
| `run(scriptPath, options)` | Run a script file |
| `status()` | Worker status |
| `list()` | Available languages |
| `has(lang)` | Check language availability |

Shortcuts pass the language through: `compute.python(...)`, `compute.julia(...)`, `compute.rust(...)` - they call `invoke` with the same `(func, args)` signature.

## Usage

```javascript
const compute = require('vant/lib/compute');

// Call a function with args in a language
const result = await compute.invoke('numpy.linalg.eig', { matrix: [[1,2],[3,4]] }, 'python');

// Or evaluate raw code
const out = await compute.evaluate('print("hello from python")', { lang: 'python' });

// Shortcuts use the same (func, args) shape
const py = await compute.python('numpy.linalg.eig', { matrix: [[1,2],[3,4]] });

// Languages + status
const langs = compute.list();
const s = compute.status();
```

## Julia sidecar

`invoke()` converts JSON arguments to Julia literals: arrays become vectors,
objects become `Dict(...)`, so the documented shape parses instead of emitting
JSON braces. Live-tested on Julia 1.10.4 and 1.11.1. Set `JULIA_DEPOT_PATH` to
a pre-populated depot for a hermetic run; a clean depot may resolve/precompile
packages on first use. Overlapping evals on one sidecar are serialized because
Julia's stdout/stderr capture is process-global.

## Events

| Event | When |
|-------|------|
| `compute:invoking` | Before exec |
| `compute:invoked` | After completion |

Also exported: `stopSidecars()` (tear the language sidecars down), the `Compute` class, and the multibrain config seams `getBrainComputeConfig`/`setBrainComputeConfig`/`getStackComputeConfigs`.

---

## Related

- [CLI](/vant/reference/cli) - the `vant compute` commands
- [Cron](/vant/operations/cron) - scheduling recur compute intervals