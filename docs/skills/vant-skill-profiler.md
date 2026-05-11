---
version: 0.8.11
permalink: /skills/vant-skill-profiler.md
layout: default
title: Skill Profiler
nav_order: 114
---

# Profiler

> Performance profiling.

---

## When To Use

- Slow code
- Performance issues
- Optimization

---

## What To Do

### 1. Profiling Types

| Type | What |
|------|------|
| CPU | Time in functions |
| Memory | Allocation tracking |
| Network | Request timing |
| I/O | File operations |

### 2. Tools

| Language | Tool |
|----------|------|
| JavaScript | 0x, clinic |
| Python | cProfile, py-spy |
| Go | pprof |
| Rust | flamegraph |

### 3. Run Profiler

```bash
# Node.js
0x index.js

# Python
python -m cProfile app.py

# Go
go test -cpuprofile=cpu.out
```

### 4. Analyze

```
pprof -http=:5000 cpu.out
# Open browser at localhost:5000
```

---

## Output

```
## Profiler

| Function | Time | Calls |
|----------|------|-------|
| [name] | [n]ms | [n] |

### Bottlenecks
- [list top 5]
```

---

**Role**: Profiler  
**Input**: Slow code  
**Output**: Bottlenecks

> Measure to improve.