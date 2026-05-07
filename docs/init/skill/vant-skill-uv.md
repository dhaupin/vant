# UV

> UV package manager.

---

## When To Use

- uv.lock present
- pyproject.toml exists
- .venv created by uv

---

## What To Do

### 1. Common Commands

| Command | What |
|---------|------|
| uv init | Initialize project |
| uv venv | Create virtual env |
| uv add | Add dependency |
| uv remove | Remove dependency |
| uv lock | Generate lockfile |
| uv sync | Sync dependencies |
| uv run | Run command |

### 2. Projects

```bash
uv init my-project
uv add requests
uv sync
```

### 3. Run Commands

```bash
uv run python main.py
uv run pytest
uv run ruff check .
```

### 4. Fast Pip

```bash
uv venv
uv pip install -r requirements.txt
```

---

## Output

```
## UV

| Package | Version |
|---------|---------|
| [name] | [version] |

### Status
- [READY]
```

---

**Role**: UV Manager  
**Input**: pyproject.toml  
**Output**: Dependencies

> Fast Python.