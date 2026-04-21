---
version: 0.8.4
title: Docker
slug: /docker
order: 11
---

# Docker

Run Vant in containers.

## Quick Start

```bash
docker run -it -v vant-brain:/app/models dhaupin/vant vant load
```

## Image

| Tag | Description |
|-----|-------------|
| `latest` | Latest release |
| `v0.8.4` | Specific version |

## Volumes

| Volume | Purpose |
|--------|---------|
| `/app/models` | Brain storage |
| `/app/config` | Config files |

## Environment

```bash
docker run -it \
  -e GITHUB_REPO=owner/repo \
  -e GITHUB_TOKEN=xxx \
  -v vant-brain:/app/models \
  dhaupin/vant vant start
```

## Compose

```yaml
version: '3.8'
services:
  vant:
    image: dhaupin/vant
    volumes:
      - vant-brain:/app/models
    environment:
      - GITHUB_REPO=owner/repo
    env_file:
      - .env
```

```bash
docker-compose up -d
```

## Build Local

```bash
docker build -t vant:local .
docker run -it vant:local vant load
```

See also: [Installation](../getting-started/install.md), [Architecture](./architecture.md)