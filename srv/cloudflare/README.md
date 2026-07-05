# Vant Cloudflare Pages

Serverless functions for Vant on Cloudflare Pages.

## How It Connects

This folder contains the **serverless functions** that run on Cloudflare Pages. They are called by the Vant Node.js app via:

1. `lib/connectors/cloudflare.js` uses `CF_PAGES_URL` env var to call these functions
2. Example: `callPages('/sync', ...)` → `https://your-project.pages.dev/sync`

**Flow:**
```
Vant (Node.js) 
    → lib/connectors/cloudflare.js 
    → CF_PAGES_URL/sync 
    → /srv/cloudflare/sync.js
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/sync` | POST | Brain sync (handshake, push, pull) |
| `/kv` | POST | Direct KV operations |

## Sync API

### Handshake
Initialize a sync chain:
```bash
curl -X POST https://your-project.pages.dev/sync \
  -H "Content-Type: application/json" \
  -d '{"action": "handshake", "chainId": "my-chain", "identity": {"name": "agent-1"}}'
```

### Push
Push encrypted blob:
```bash
curl -X POST https://your-project.pages.dev/sync \
  -H "Content-Type: application/json" \
  -d '{"action": "push", "chainId": "my-chain", "seq": 1234567890, "data": "encrypted-content"}'
```

### Pull
Pull blobs since sequence:
```bash
curl -X POST https://your-project.pages.dev/sync \
  -H "Content-Type: application/json" \
  -d '{"action": "pull", "chainId": "my-chain", "since": 1234567000}'
```

## KV API

### Get
```bash
curl -X POST https://your-project.pages.dev/kv \
  -H "Content-Type: application/json" \
  -d '{"action": "get", "key": "my-key"}'
```

### Put
```bash
curl -X POST https://your-project.pages.dev/kv \
  -H "Content-Type: application/json" \
  -d '{"action": "put", "key": "my-key", "value": "my-value"}'
```

### List
```bash
curl -X POST https://your-project.pages.dev/kv \
  -H "Content-Type: application/json" \
  -d '{"action": "list", "prefix": "chain:"}'
```

## Setup

### 1. Create KV Namespace
```bash
wrangler kv:namespace create VANT_KV
```

### 2. Update wrangler.toml
Replace `<YOUR_KV_NAMESPACE_ID>` with your KV namespace ID.

### 3. Deploy
```bash
# Using wrangler
wrangler pages deploy . \
  --project-name=vant-sync \
  --branch=main
```

Or connect to GitHub for automatic deployments.

## Environment Variables

These are set in the Node.js app via config:

| Variable | Config Key | Description |
|----------|------------|-------------|
| `CF_PAGES_URL` | `config.cfPagesUrl()` | Your CF Pages deployment URL |
| `CF_ACCOUNT_ID` | `config.cfAccountId()` | Cloudflare account ID |
| `CF_API_TOKEN` | `config.cfApiToken()` | Cloudflare API token |
| `CF_KV_NAMESPACE` | `config.cfKvNamespace()` | KV namespace ID |
| `VANT_KV` | (binding) | KV Namespace binding (wrangler.toml) |

## Local Development

```bash
# Install wrangler
npm install -g wrangler

# Run local dev server
wrangler pages dev .
```

## Files

- `index.js` - Root handler & health check
- `sync.js` - Brain sync endpoint
- `kv.js` - Direct KV operations
- `wrangler.toml` - Cloudflare configuration
