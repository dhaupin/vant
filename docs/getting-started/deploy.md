---
layout: default
title: Deploy
permalink: /getting-started/deploy
nav_order: 5
description: Full deployment rundown - local, Docker, cloud, edge. The repo DEPLOY.md is the canonical guide.
version: 0.8.6
---

# Deploying Vant

The **canonical, code-verified deployment guide lives in the repo: [DEPLOY.md](https://github.com/dhaupin/vant/blob/main/DEPLOY.md)**. It covers local install, remote/Docker, cloud, edge, the port map, security hardening, monitoring, and backup/restore (backup, horcrux, transform).

This page is the signpost plus the two facts people ask for most.

## Port Map (pass 127)

Four listeners, all loopback-bound by default, all env-overridable. The map avoids common co-tenants on a shared host: 3000 (Grafana, Gitea, Next dev), 3100 (Loki), 5432 (postgres), 6379 (redis), 8080 (generic HTTP).

| Service | Port | Env override | Bind env |
|---------|------|--------------|----------|
| REST server (`vant server`) | 3456 | `VANT_SERVER_PORT` | `VANT_SERVER_BIND` |
| MCP server (`vant mcp`) | 3457 | `VANT_MCP_PORT` | `VANT_MCP_BIND` |
| Webhook receiver (`lib/webhooks.js`) | 3467 | `VANT_WEBHOOK_PORT` | `VANT_WEBHOOK_BIND` |
| Metrics/health HTTP (`lib/health.js`) | 3468 | `VANT_HEALTH_PORT` | `VANT_HEALTH_BIND` |
| Mesh crew bus (`lib/genesis.js`) | 4890-4892 | per-call `port` opt | - |
| Headless mode | follows 3456 | `VANT_SERVER_PORT` | `VANT_SERVER_BIND` |

Before 0.8.6 (pass 127): the webhook receiver defaulted to the REST port (3456 - a guaranteed collision), the mesh node runner defaulted its MCP door to 3456 too, islands fell back to 3100 (Loki's port), headless hardcoded port 3000, and the health HTTP server was the one listener that bound all interfaces.

## Docker Quickstart

The repo `Dockerfile` installs runtime deps, runs as non-root, and defaults to the full runtime (`bin/vant.js all`: MCP 3457 + REST 3456 in one process) with a `HEALTHCHECK` on `GET /health`.

```bash
docker run -d --name vant \
  -p 3456:3456 -p 3457:3457 \
  -e GITHUB_TOKEN -e GITHUB_REPO=owner/repo \
  -v vant-models:/app/models \
  --restart unless-stopped \
  dhaupin/vant:latest
```

Inside the container the image binds all interfaces (`VANT_SERVER_BIND=0.0.0.0` - docker `-p` forwards to the container IP, so a loopback bind would be unreachable); exposure is controlled at the host edge, e.g. publish on host loopback with `-p 127.0.0.1:3456:3456` or front the server with a TLS reverse proxy.

## Reading Order

- [Setup](/vant/getting-started/setup) - config.ini and tokens
- [Docker](/vant/integrations/docker) - container specifics
- [Security](/vant/security/sandbox) - the deny-by-default chain
- Repo [DEPLOY.md](https://github.com/dhaupin/vant/blob/main/DEPLOY.md) - everything above, in depth

If this page and the repo DEPLOY.md ever disagree, the repo file wins: it is verified against the code every pass.
