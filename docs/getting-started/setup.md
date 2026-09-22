---
version: 0.8.6
permalink: /getting-started/setup
layout: default
title: Setup Guide
nav_order: 13
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

Vant ≥0.9 stores brains in per-brain directories
(`models/public/<brain>/`, `models/private/<brain>/`) plus a brain stack in
`models/state.json`. If your install predates this (files sitting flat in
`models/public/`), **`vant start` migrates you automatically** on first run
and shows a confirmation banner — your brain name defaults to `vant`.

Manual control:

```bash
vant migrate --status              # what's pending / layout version
vant migrate --dry-run             # preview the moves, touch nothing
vant migrate --brain-name mybrain  # choose the imported brain's name
vant migrate                       # apply (default name: vant)
```

Detection is content-based and idempotent — safe to run any time, no-op on
already-multi-brain trees. `vant start --no-migrate` skips the auto-import.
MCP clients can check via the `brain_migration_status` tool.

## Environment Variables

### Required

| Variable | Description | How to Get |
|----------|------------|------------|
| `GITHUB_TOKEN` | GitHub API token | [Create token](https://github.com/settings/tokens) |

### Optional - Server

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_SERVER_PORT` | Server port | 3456 |
| `VANT_SERVER_BIND` | Bind address | 127.0.0.1 |
| `VANT_SERVER_CERT` | TLS certificate | - |
| `VANT_SERVER_KEY` | TLS key | - |
| `VANT_SERVER_INSECURE` | Allow HTTP | false |
| `VANT_SERVER_AUTH_REQUIRED` | Require auth | false |

### Optional - Authentication

| Variable | Description |
|----------|------------|
| `VANT_API_KEY` | Server API key |
| `VANT_MCP_API_KEY` | MCP API key |
| `VANT_TOKEN_SECRET` | Secret for signing auth tokens (required for multi-instance) |

### Optional - AI

| Variable | Description | Default |
|----------|------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `MODEL` | Model to use | gpt-4o |

### Optional - Storage

| Variable | Description | Default |
|----------|------------|---------|
| `VANT_STATES_DIR` | States directory | states/active |
| `VANT_MODELS_DIR` | Models directory | models/private |

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

```dockerfile
FROM node:20

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .

ENV GITHUB_TOKEN=your_token
ENV VANT_SERVER_PORT=3456
VANT_MCP_PORT=3100

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

Use `--insecure` for development or set up TLS certificates.