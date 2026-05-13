---
version: 0.8.11
permalink: /skills/vant-skill-python.md
layout: default
title: Skill Python
nav_order: 139
---

# Python

> Python package management.

---

## When To Use

- Python projects
- requirements.txt
- pyproject.toml
- .venv present

---

## What To Do

### 1. Tools

| Tool | Use |
|------|-----|
| pip | Default package manager |
| uv | Fast package manager |
| poetry | Project management |
| pipenv | Pip + virtualenv |

### 2. Pip Commands

```bash
pip install requests
pip install -r requirements.txt
pip freeze > requirements.txt
```

### 3. UV Commands

```bash
uv add requests
uv venv
uv sync
uv run python main.py
```

### 4. Poetry Commands

```bash
poetry add requests
poetry install
poetry run python main.py
poetry build
```

### 5. Virtual Environments

```bash
# venv
python -m venv .venv
source .venv/bin/activate

# conda
conda create -n myenv python=3.11
conda activate myenv
```

---

## Output

```
## Python

| Package | Version | Tool |
|---------|---------|------|
| [name] | [version] | [pip/uv/poetry] |

### Environment
- [tool]
```

---

**Role**: Python Developer  
**Input**: requirements.txt / pyproject.toml  
**Output**: Dependencies

> Python packages.