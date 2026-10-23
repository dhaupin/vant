---
version: 0.8.6
permalink: /getting-started/setup
layout: default
title: Setup Guide
description: Run the interactive setup wizard to write Vant's config and environment scaffolding.
nav_order: 14
---
# Setup Guide

> AI-first guide for setting up Vant environment

## Quick Setup

```bash
# Interactive setup
vant setup

# Non-interactive
export GITHUB_TOKEN=your_token
vant start
```

## Upgrading an old (single-brain) install

Vant (the axolotl line, v0.8.6) stores brains in per-brain directories
(`models/public/<brain>/`, `models/private/<brain>/`) plus a brain stack in
`models/state.json`. If your install predates this (files sitting flat in
`models/public/`), **`vant start` migrates you automatically** on first run
and shows a confirmation banner, your brain name defaults to `vant`.

Manual control:

```bash
vant migrate --status              # what's pending / layout version
vant migrate --dry-run             # preview the moves, touch nothing
vant migrate --brain-name mybrain  # choose the imported brain's name
vant migrate                       # apply (import name: --brain-name > VANT_BRAIN > "vant")
```

Detection is content-based and idempotent, safe to run any time, no-op on
already-multi-brain trees. `vant start --no-migrate` skips the auto-import.
MCP clients can check via the `brain_migration_status` tool. The full
contract, naming rules, and troubleshooting are in the
[Migration Guide](/vant/getting-started/migration).

## Environment Variables

This page lists the vars most installs touch. The full registry (every
`VANT_*` var mapped to its config key, ~100 entries including RAG, prune,
marking, webhook, and QoS knobs) lives in the
[Config Reference](/vant/reference/config): `config.get`, the ini dialect,
and the env registry are the same source of truth.

### Required

| Variable | Description | How to Get |
|----------|------------|------------|
| `GITHUB_TOKEN` | GitHub API token (or `VANT_GITHUB_TOKEN`) | [Create token](https://github.com/settings/tokens) |

`GITHUB_TOKEN` is only required when you use sync / the GitHub API. A local,
sync-less install runs fine with no token at all.

### Optional - Server

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_SERVER_PORT` | Server port | 3456 |
| `VANT_SERVER_BIND` | Bind address | 127.0.0.1 |
| `VANT_SERVER_CERT` | TLS certificate | - |
| `VANT_SERVER_KEY` | TLS key | - |
| `VANT_SERVER_INSECURE` | Allow HTTP | false |
| `VANT_SERVER_AUTH_REQUIRED` | Require auth | false |
| `VANT_HEALTH_PORT` / `VANT_HEALTH_BIND` | Health check endpoint | 3468 / 127.0.0.1 |
| `VANT_WEBHOOK_PORT` / `VANT_WEBHOOK_BIND` | Webhook surface | 3467 / 127.0.0.1 |
| `VANT_WEBHOOK_SECRET` | Webhook signing secret | - |

### Optional - Authentication

| Variable | Description |
|----------|------------|
| `VANT_AUTH_KEY` | API key for the REST/MCP doors (the canonical secret; `VANT_API_KEY` and `VANT_MCP_API_KEY` still work as deprecated aliases) |
| `VANT_TOKEN_SECRET` | Secret for signing auth tokens (required for multi-instance) |
| `VANT_MCP_REQUIRE_KEY` | `true` forces key auth on MCP POSTs |
| `VANT_MODE` / `VANT_API_KEY` | headless/api mode + door key for server runs |

### Optional - AI

| Variable | Description | Default |
|----------|------------|---------|
| `OPENAI_API_KEY` | OpenAI embeddings/rerank key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `PINECONE_API_KEY` / `_ENV` / `_INDEX` | Optional remote vector index | - |

### Optional - Storage & Brain

| Variable | Description | Default |
|----------|------------|---------|
| `MODEL_PATH` / `VANT_BRAIN_PATH` | Brain root / override (multibrain sits under `models/<type>/<brain>/` inside it) | models/private |
| `VANT_BRAIN` | Active brain name (also the `vant migrate` import fallback) | `vant` |
| `VANT_STORAGE_PATH` | State-store path | models/private |
| `VANT_STORAGE_ENCRYPT` / `VANT_STORAGE_KEY` | At-rest encryption for the file store | off / - |
| `VANT_MCP_PORT` / `VANT_MCP_BIND` | MCP server port / bind | 3457 / 127.0.0.1 |

### Optional - Git Providers & Mesh

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_GITHUB_REPO` | GitHub repo for storage/sync | dhaupin/vant |
| `GITLAB_TOKEN` + `_URL` / `GITEA_TOKEN` + `_URL` / `BITBUCKET_TOKEN` | Sync credentials per non-GitHub host (provider auto-detected from the remote URL) | - |
| `VANT_REMOTE_PROVIDER` (+ `VANT_REMOTE_*` family) | S3-compatible remote store (S3, R2, MinIO, B2); CLI `vant s3` | - |
| `VANT_MESH_SECRET` | Sealed-carrier mesh secret for distributed installs | - |

## TLS Setup

### Generate Self-Signed Certificate (Development)

```bash
# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Start server with certificate
vant server --cert cert.pem --key key.pem
```

### Production Certificate

1. Use Let's Encrypt:

```bash
certbot certonly --standalone -d yourdomain.com
```

2. Configure server:

```bash
vant server --cert /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
  --key /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

## Docker Setup

Match the real image env contract (see the repo `Dockerfile`):

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV GITHUB_TOKEN=your_token
ENV GITHUB_REPO=your-username/your-brain-repo

EXPOSE 3456

CMD ["vant", "server"]
```

## Security Checklist

- [ ] Set `GITHUB_TOKEN`
- [ ] Use TLS in production
- [ ] Set `VANT_API_KEY` for server auth
- [ ] Bind to localhost in development
- [ ] Review firewall rules
- [ ] Enable rate limiting

## Troubleshooting

### "API rate limit exceeded"

Set `GITHUB_TOKEN` environment variable.

### "Connection refused"

Check server is running: `vant health`

### "TLS certificate error"

Set up TLS certificates (see [TLS Setup](#tls-setup) above); the dev server
also accepts `VANT_SERVER_INSECURE=1` for plain HTTP.

---

## Related

- [Install](/vant/getting-started/install) - installation methods and requirements
- [Quick Start](/vant/getting-started/quick-start) - the fastest path from install to a working brain
- [Troubleshooting](/vant/advanced/troubleshooting) - the deeper error playbook