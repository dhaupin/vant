---
version: 0.8.6
permalink: /integrations/docker
layout: default
title: Docker
nav_order: 84
---
# Docker

Run Vant in containers.

```text
┌─────────────────────────────────────────────┐
│          Vant Docker Setup                    │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │        Docker Container               │   │
│  │                                     │   │
│  │  /app/models  ← brain volume        │   │
│  │  /app/config ← config volume       │   │
│  │                                     │   │
│  │  Port 3100 ← MCP              │   │
│  │  Port 3456 ← API/Server        │   │
│  └─────────────────────────────────────┘   │
│                   │                        │
│                   ▼                        │
│         GitHub (external)                   │
└─────────────────────────────────────────────┘
```

## Quick Start

### Run Container

```bash
# Basic run
docker run -it dhaupin/vant vant start

# With brain volume
docker run -it -v vant-brain:/app/models dhaupin/vant vant load

# With full config
docker run -it \
  -e GITHUB_REPO=owner/repo \
  -e GITHUB_TOKEN=xxx \
  -v vant-brain:/app/models \
  dhaupin/vant vant start
```

### MCP Server

```bash
# Run MCP server
docker run -d -p 3456:3456 \
  -e GITHUB_REPO=owner/repo \
  -e GITHUB_TOKEN=xxx \
  -v vant-brain:/app/models \
  dhaupin/vant vant serve
```

## Image Tags

| Tag | What | Use For |
|-----|------|--------|
| latest | Latest release | Development |
| v0.8.x | Specific version | Production |
| v0.8.6 | Pinned version | Reproducibility |

```bash
# Pull specific version
docker pull dhaupin/vant:v0.8.11
```

## Volumes

| Volume | Purpose | Persists |
|--------|---------|---------|
| /app/models | Brain storage | Yes |
| /app/config | Config files | Yes |
| /app/logs | Log files | No |

```bash
# Create volume
docker volume create vant-brain

# Use volume
docker run -v vant-brain:/app/models dhaupin/vant vant start
```

## Upgrading an existing volume (pre-multi-brain layout)

If your volume predates the multi-brain layout (brain files flat in
`models/public/`), the first `vant start` on Vant ≥0.9 imports it
automatically, default brain name `vant`, confirmation banner on the CLI.
Skip with `--no-migrate`, or run manually:

```bash
docker run -v vant-brain:/app/models dhaupin/vant vant migrate --status
docker run -v vant-brain:/app/models dhaupin/vant vant migrate --dry-run
docker run -v vant-brain:/app/models dhaupin/vant vant migrate --brain-name mybrain
docker run -v vant-brain:/app/models dhaupin/vant vant migrate
```

Detection is content-based and idempotent; nothing is lost, and repeat runs
are no-ops.

## Environment Variables

| Variable | Required | What |
|----------|----------|------|
| GITHUB_TOKEN | Yes | GitHub API token |
| GITHUB_REPO | Yes | Brain repository |
| VANT_PORT | No | Server port (default: 3456) |
| VANT_DEBUG | No | Debug mode (0/1) |
| MCP_REQUIRE_API_KEY | No | Require API key |

## Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

ENV NODE_ENV=production

EXPOSE 3456

CMD ["node", "bin/vant.js", "serve"]
```

## docker-compose.yaml

```yaml
version: '3.8'

services:
  vant:
    image: dhaupin/vant:latest
    ports:
      - "3456:3456"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_REPO=${GITHUB_REPO}
    volumes:
      - vant-brain:/app/models
    restart: unless-stopped

volumes:
  vant-brain:
```

Run:

```bash
docker-compose up -d
```

## Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vant
  template:
    spec:
      containers:
      - name: vant
        image: dhaupin/vant:latest
        env:
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: vant-secrets
              key: github-token
        - name: GITHUB_REPO
          value: owner/brain
        ports:
        - containerPort: 3456
        volumeMounts:
        - name: brain
          mountPath: /app/models
      volumes:
      - name: brain
        persistentVolumeClaim:
          claimName: vant-brain
```

## Health Check

```bash
# Check health
curl http://localhost:3456/health

# Response
{"status": "ok", "version": "0.8.11", "uptime": 3600}
```

---

## Related

- [Deployment Tutorial](/vant/operations/deployment)
- [Server](/vant/runtime/server) - HTTP server
- [Security](/vant/security/) - VAF + sandbox
```text