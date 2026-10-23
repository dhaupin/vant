---
version: 0.8.6
permalink: /reference/config
layout: default
title: Configuration
description: Configuration reference - every config key, its default, and where it takes effect.
nav_order: 112
---
# Configuration

All configuration files for Vant.

## Config precedence (the four surfaces)

Every config key can come from four places. When several define the same
key, the layers win in THIS order (highest first):

| # | Surface | Where it lives | Lifetime | Set via |
|---|---------|----------------|----------|---------|
| 1 | **Runtime flags** | in-process `_flags` map in `lib/config.js` | dies with the process | `config.setFlag()` inside a running runtime, MCP `vant_config_set` |
| 2 | **Brain config** | `models/private/<brain>/config.json` | persists, per brain | `vant config set <key> <val>` (writes the CURRENT brain) |
| 3 | **Global config** | `lib/config.js` `load()`: env defaults + `vant.config.js` (vm-sandboxed) | per process | `.env` vars, `vant.config.js` |
| 4 | **Built-in defaults** | the literals in `load()` | - | - |

Resolution rules, as implemented in `config.get(key)`:

1. **Runtime flag first.** `_flags` wins over everything - in-process
   callers keep instant round-trips (`setFlag` then `get` returns it).
2. **Brain config next** (when `options.brain` is given, or via the
   dedicated accessors like `mcpRequireKey()`). `vant config set` persist
   writes here, so cross-process callers see the value.
3. **Global config last**: env-primed defaults overlaid by `vant.config.js`
   (read via a bare `vm` sandbox - configs are data, not code; nothing can
   `require` from it).
4. **Then the built-in default**, then the caller's `defaultValue`.

Dedicated accessors (e.g. `mcpRequireKey()`, `mcpApiKey()`) follow the
same ladder: flag -> env var -> brain config -> fallback. A key present at
several layers resolves silently to the highest one; run
`vant config list` to see the merged view.

Env-var inventory is a *registry*, not the resolution rule:
`ENV_REGISTRY` (43 entries, pass 186) names every `VANT_*` var the
general runtime consumes; `vant config list env` prints resolved values
(masked secrets, unset keys visible with `includeUnset`). Per-domain
families (spine seeds, genesis mesh, sudo, s3 `REMOTE_*`) are dialed by
their own modules - those modules are the reader of record, not config.js.

## Environment Variables (.env)

Required and optional environment variables:

```bash
# Required - GitHub access
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO=owner/repo

# Optional - Branch (default: main)
GITHUB_BRANCH=main

# Optional - Stegoframe transport
STEGOFRAME_ROOM=your_room_id
STEGOFRAME_PASSPHRASE=your_passphrase

# Optional - Runtime overrides
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token |
| `GITHUB_REPO` | Yes | Brain repository (owner/repo) |
| `GITHUB_BRANCH` | No | Branch name (default: main) |
| `STEGOFRAME_ROOM` | No | Stegoframe room ID |
| `STEGOFRAME_PASSPHRASE` | No | Stegoframe passphrase |
| `POLLING_INTERVAL` | No | Poll interval (ms) |
| `MAX_REQUESTS_PER_HOUR` | No | Rate limit cap |

## GitLab

```bash
GITLAB_TOKEN=your_gitlab_token
GITLAB_REPO=owner/repo
GITLAB_URL=https://gitlab.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GITLAB_TOKEN` | Yes | GitLab Personal Access Token |
| `GITLAB_REPO` | Yes | Project path (owner/repo) |
| `GITLAB_URL` | No | GitLab instance URL |

## Bitbucket

```bash
BITBUCKET_TOKEN=your_bitbucket_token
BITBUCKET_WORKSPACE=your_workspace
BITBUCKET_REPO=your_repo
```

| Variable | Required | Description |
|----------|----------|-------------|
| `BITBUCKET_TOKEN` | Yes | Bitbucket Access Token |
| `BITBUCKET_WORKSPACE` | Yes | Workspace name |
| `BITBUCKET_REPO` | Yes | Repository slug |

## Self-Hosted Git

```bash
GIT_TOKEN=your_git_token
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GIT_TOKEN` | No | Git token/SSH key |

## Additional Environment Variables
Configuration via environment.

### MCP Server

| Variable | Required | Description |
|----------|----------|-------------|
| `VANT_MCP_PORT` | No | MCP server port (default: 3457) |
| `VANT_MCP_BIND` | No | MCP bind address (default: 127.0.0.1) |
| `VANT_MCP_API_KEY` | No | API key for MCP authentication |
| `VANT_MCP_REQUIRE_KEY` | No | Force API key auth (`true`/`false`) |
| `VANT_AGREE_AUTO_SYNC` | No | Enable auto-polling: set to `"true"` to confirm (see notes) |

### Relay posture (Mode R - brain config keys, NOT env vars)

The r/2 relay face (COMPOSED of webhook transport + MCP door + lib/api
face; there is NO lib/relay module, the no-legacy-bloat guard pins
that) reads these brain-config keys (layer 2 - set with
`vant config set`, per brain):

| Key | Required | Description |
|-----|----------|-------------|
| `relay.enabled` | No | Mount the relay face at `POST /relay` on the webhook transport when a gate secret is set (`true`/`false`, default `false`) |
| `relay.gateKey` | No | The HMAC secret over the raw body bytes (`X-Signature-256`). No key set = fail-closed (`vant relay gate` generates one, shown ONCE) |
| `relay.channelKey` | No | The e2e (AES-256-GCM) pair key the ride face opens envelopes with (`vant relay channel` generates one, shown ONCE). Absent = rides refuse typed, hops unaffected |
| `relay.intranetOrigins` | No | RECOMMENDED LAN-scope posture: plain-http hop origins admitted ONLY for loopback/RFC1918/IPv6-ULA scopes; the outbound fetch keeps a scoped SSRF wall (cloud metadata 169.254/16, multicast, 0.0.0.0 refuse in EVERY posture - see docs/operations/relay.md) |
| `relay.allowPrivateOrigins` | No | LAB ESCAPE ONLY: http anywhere + the private fetch wall lifted (`skipDomainCheck`). Host posture, never a default |

Recommended order: `vant config set relay.enabled true`, `vant relay
gate`, `vant relay channel`, then start the pod (`vant server` / `all` /
`headless`) - the boot mounts the face onto the webhook transport (port
3467 default, loopback-bound like every listener; widen deliberately
with `VANT_WEBHOOK_*`). OFF is first-class: no register, no server, no
route. ON without a gate secret binds NOTHING (fail-closed).

### Notifications

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_WEBHOOK_URL` | No | Slack webhook for notifications |
| `DISCORD_WEBHOOK_URL` | No | Discord webhook for notifications |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot for commands |

### Agent / Node

| Variable | Required | Description |
|----------|----------|-------------|
| `VANT_AGENT_ID` | No | Agent identifier (multi-agent) |
| `VANT_BRANCH` | No | Git branch to use |

### Paths

| Variable | Required | Description |
|----------|----------|-------------|

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFIG_PATH` | No | Path sync.js reads for GITHUB_REPO (default: config.ini) |
| `MODEL_PATH` | No | Path to brain files (default: models/private) |

## config.ini note (read this first)

`lib/config.js` reads **no `.ini` file** - there is no ini reader in the
config layer. Configuration resolves from two real layers:

1. **Environment variables** (`VANT_*`, `MCP_*`, `GITHUB_*`, and the
   security tunables below)
2. **Per-brain runtime config** (`models/private/<brain>/config.json`,
   read/written by `vant config get|set`)

There IS one partial ini reader elsewhere: `bin/sync.js` parses
`config.ini` (`CONFIG_PATH`, default `config.ini`) for `GITHUB_REPO`, and
`vant setup` writes that file as the per-install record of your
repo/branch/stegoframe choices. That file tells `vant sync` where to
push your brain - nothing else. Every other setting (MCP keys, server
ports, security tunables, notification webhooks) is env-var or
brain-config only; no code reads a `settings.ini` or `mood.ini`.

`config.example.ini` / `settings.example.ini` are name reference cards
(their key names stay accepted as aliases in the config layer).

If you want to persist a setting, use the env var (shell profile, .env,
or deployment env) or `vant config set <key> <value>`.

## Environment variables (the real config surface)

```bash
# GitHub (sync)
export GITHUB_TOKEN=...          # never store this in a file
export GITHUB_REPO=your-username/your-repo
export GITHUB_BRANCH=main

# Runtime
export MODEL_PATH=models/private
export VANT_BRAIN=mybrain        # multi-brain: which brain this process uses

# MCP Server
export VANT_MCP_PORT=3457
export VANT_MCP_API_KEY=your-secret-key
export VANT_MCP_REQUIRE_KEY=true

# Server
export VANT_SERVER_PORT=3456
export VANT_SERVER_BIND=127.0.0.1
```

### Security Settings Reference

Set these as environment variables (they feed vaf, qos, and audit):

```bash
# VAF (Input Validation & Filtering)
export MAX_STRING_LENGTH=100000
export MAX_DEPTH=5
export MAX_ARRAY_LENGTH=1000

# Rate Limiting
export MAX_REQUESTS_PER_MINUTE=60
export MAX_REQUESTS_PER_HOUR=1000
export MAX_BURST=10

# Path Protection
export MAX_PATH_LENGTH=4096
export BLOCK_PATH_TRAVERSAL=true

# Audit
export AUDIT_LOG=true
export AUDIT_FILE=.audit.log
```

| Setting | Default | Description |
|---------|---------|-------------|
| **VAF Settings** |||
| MAX_STRING_LENGTH | 100000 | Max input string length |
| MAX_DEPTH | 5 | Max nested object depth |
| MAX_ARRAY_LENGTH | 1000 | Max array items |
| **Rate Limiting** |||
| MAX_REQUESTS_PER_MINUTE | 60 | Requests per minute |
| MAX_REQUESTS_PER_HOUR | 1000 | Requests per hour |
| MAX_BURST | 10 | Burst requests |
| **Path Protection** |||
| MAX_PATH_LENGTH | 4096 | Max path length |
| BLOCK_PATH_TRAVERSAL | true | Block .. in paths |
| **Audit** |||
| AUDIT_LOG | true | Enable logging |
| AUDIT_FILE | .audit.log | Log file |

---

## Related

- [CLI](/vant/reference/cli) - the `vant config get/set` commands
- [Security Environment](/vant/security/environment) - the env vars config reads
- [Multi-Agent Crews](/vant/multi-agent/agents) - roles config drives
