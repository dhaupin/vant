---
version: 0.8.6
permalink: /operations/deployment
layout: default
title: Deployment
nav_order: 64
---

# Tutorial: Deploy Vant

> Deploy Vant to production

## Where

### Local

```bash
# Full runtime (layout check + health)
vant start

# Long-running servers
vant server   # REST, port 3456
vant mcp      # MCP, port 3457
vant all      # Both in one process
```

### Docker

The repo ships a remote-ready `Dockerfile` (non-root, deps installed, healthcheck) - use it rather than hand-rolling:

```bash
docker build -t vant .
docker run -d --name vant \
  -p 3456:3456 -p 3457:3457 \
  -v vant-models:/app/models \
  --restart unless-stopped \
  vant
```

Default command is the full runtime (`bin/vant.js all`: REST 3456 + MCP 3457, `HEALTHCHECK` on `GET /health`). There is no `vant serve` or `vant start --daemon` command - run servers under your supervisor (systemd, pm2, docker restart policy).

### Vercel

```bash
npm i -g vercel
vercel deploy
```

### Fly.io

```bash
fly launch
fly deploy
```

---

## Environment

Required:

```bash
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=owner/repo
```

Optional:

```bash
VANT_SERVER_PORT=3456
VANT_MCP_PORT=3457
VANT_MCP_REQUIRE_KEY=true
```

---

## Health

Check deployment:

```bash
curl https://your-domain.com/health
```

Response:

```json
{
  "status": "ok",
  "version": "0.8.6",
  "uptime": 3600
}
```

---

## Scale

### Horizontal

Multiple instances:

```bash
# Each instance gets unique agent ID
VANT_AGENT_ID=agent-1 vant server
VANT_AGENT_ID=agent-2 vant server
VANT_AGENT_ID=agent-3 vant server
```

### Vertical

Memory per instance:

```bash
# 512MB default
docker run -m 512m vant

# 2GB for large brains
docker run -m 2g vant
```

---

## More

See [Server](/vant/runtime/server) and [Docker](/vant/integrations/docker).