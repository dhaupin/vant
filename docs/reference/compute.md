---
version: 0.9.0
permalink: /reference/compute
layout: default
title: Compute API
nav_order: 122
---

# Compute API

Execute code in sandboxed environments. Supports multiple languages.

> Beta v0.9.0

## Languages Supported

Language connectors live in `lib/connectors/` (subprocess per language):
python, julia, rust, plus node/ruby/go/php connectors.

## Functions

| Function | What |
|----------|------|
| `invoke(func, args, lang)` | Call a function in a language (default python) |
| `evaluate(code, {lang, timeout})` | Evaluate raw foreign code |
| `run(scriptPath, options)` | Run a script file |
| `status()` | Worker status |
| `list()` | Available languages |
| `has(lang)` | Check language availability |

Shortcuts pass the language through: `compute.python(...)`,
`compute.julia(...)`, `compute.rust(...)` - they call `invoke` with the
same `(func, args)` signature.

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

## Events

| Event | When |
|-------|------|
| `compute:invoking` | Before exec |
| `compute:invoked` | After completion |