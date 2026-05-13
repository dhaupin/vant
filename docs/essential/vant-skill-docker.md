---
version: 0.8.11
permalink: /essential/vant-skill-docker.md
layout: default
title: Skill Docker
nav_order: 120
---

# Docker

> Container operations.

---

## When To Use

- Build images
- Run containers
- Local dev

---

## What To Do

### 1. Start Docker

```bash
sudo dockerd > /tmp/docker.log 2>&1 &
sleep 5
```

### 2. Common Commands

| Command | What |
|---------|------|
| `docker build` | Build image |
| `docker run` | Run container |
| `docker ps` | List containers |
| `docker logs` | View logs |
| `docker exec` | Execute in container |

### 3. Dockerfile

```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "index.js"]
```

### 4. Compose

```yaml
version: '3'
services:
  app:
    build: .
    ports:
      - "3000:3000"
```

---

## Output

```
## Docker

| Image | Size | Status |
|-------|------|--------|
| [name] | [n]MB | [READY] |

### Containers
- [list]
```

---

**Role**: Docker Operator  
**Input**: Dockerfile  
**Output**: Containers

> Containers are portable.