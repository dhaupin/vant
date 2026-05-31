---
version: 0.9.0
permalink: /reference/compute
layout: default
title: Compute API
nav_order: 82
---

# Compute API

Execute code in sandboxed environments. Supports multiple languages.

> Beta v0.9.0

## Languages Supported

| Language | Shortcut | Notes |
|----------|---------|-------|
| Python | `compute.python()` | Via subprocess |
| Julia | `compute.julia()` | Via subprocess |
| Rust | `compute.rust()` | Via subprocess |

## Functions

| Function | What |
|----------|------|
| `invoke(lang, code)` | Execute code |
| `eval(code)` | JavaScript eval |
| `run(code)` | Run in sandbox |
| `status()` | Worker status |
| `list()` | Active runs |
| `has(feature)` | Check capability |

## Usage

```javascript
const compute = require('vant/lib/compute');

// Direct execution
const result = await compute.invoke('python', 'print(2 + 2)');
// → { stdout: '4', stderr: '' }

// Shortcuts
const py = await compute.python('import sys; print(sys.version)');
const jl = await compute.julia('println(2 + 2)');
const rs = await compute.rust('fn main() { println!("hello"); }');

// Status
const s = compute.status();
// → { workers: 3, active: 0 }
```

## Events

| Event | When |
|-------|------|
| `compute:starting` | Before exec |
| `compute:complete` | After completion |
| `compute:error` | On error |