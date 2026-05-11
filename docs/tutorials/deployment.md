---
version: 0.8.11
permalink: /tutorials/deployment
layout: default
title: Deployment
nav_order: 10
---

# Tutorial: Deploy Vant

> Deploy Vant to production

## Where

### Local

```bash
# CLI
vant start

# As service
vant start --daemon
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install

EXPOSE 3456

CMD ["node", "bin/vant.js", "serve"]
```

Build & run:

```bash
docker build -t vant .
docker run -d -p 3456:3456 vant
```

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
VANT_PORT=3456
VANT_DEBUG=0
MCP_REQUIRE_API_KEY=true
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
  "version": "0.8.11",
  "uptime": 3600
}
```

---

## Scale

### Horizontal

Multiple instances:

```bash
# Each instance gets unique agent ID
VANT_AGENT_ID=agent-1 vant serve
VANT_AGENT_ID=agent-2 vant serve
VANT_AGENT_ID=agent-3 vant serve
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

See [Server](/guides/server) and [Docker](/guides/docker).