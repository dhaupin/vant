---
version: 0.8.11
permalink: /skills/vant-skill-yaml.md
layout: default
title: Skill Yaml
nav_order: 142
---

# YAML

> Data serialization.

---

## When To Use

- Config files
- Docker Compose
- GitHub Actions

---

## What To Do

### 1. Syntax

```yaml
key: value
number: 42
boolean: true
list:
  - item1
  - item2
object:
  nested: value
```

### 2. Anchors

```yaml
defaults: &defaults
  adapter: postgres

development:
  <<: *defaults
  database: dev
```

### 3. Common Files

| File | Use |
|------|-----|
| docker-compose.yml | Docker |
| .github/workflows/*.yml | CI/CD |
| .gitlab-ci.yml | GitLab CI |

### 4. Tools

```bash
# Validate
yamllint file.yml
python -c "import yaml; yaml.safe_load(open('f.yml'))"
```

---

**Role**: YAML Writer  
**Input**: Data  
**Output**: Config

> Config files.