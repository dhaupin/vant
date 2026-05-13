---
version: 0.8.11
permalink: /skills/vant-skill-shell.md
layout: default
title: Skill Shell
nav_order: 148
---

# Shell

> Command line.

---

## When To Use

- Terminal work
- Scripts
- DevOps

---

## What To Do

### 1. Basics

| Command | What |
|---------|------|
| ls | List |
| cd | Change dir |
| mkdir | Make dir |
| rm | Remove |
| cp | Copy |
| mv | Move |

### 2. Pipes

```bash
command1 | command2
cat file | grep pattern | sort
```

### 3. Scripts

```bash
#!/bin/bash
for f in *.txt; do
  echo "$f"
done
```

### 4. Permissions

```bash
chmod +x script.sh
chmod 755 script.sh
```

---

**Role**: Shell User  
**Input**: Commands  
**Output**: Results

> CLI.