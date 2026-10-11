---
version: 0.8.6
permalink: /reference/config
layout: default
title: Configuration
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
| `CONFIG_PATH` | No | Path to config.ini |
| `MODEL_PATH` | No | Path to brain files (default: models/private) |

## config.ini

Core configuration:

```ini
# Core
VANT_VERSION=v0.8.6
MODEL_PATH=models/private
STATE_PATH=states/active/current.json

# GitHub (set via environment variable)
GITHUB_REPO=your-username/your-repo
GITHUB_BRANCH=main

# Runtime
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360

# MCP Server (optional)
MCP_API_KEY=your-secret-api-key
MCP_PORT=3457
```

### Sections

| Section | Options |
|---------|---------|
| Core | VANT_VERSION, MODEL_PATH, STATE_PATH |
| GitHub | GITHUB_REPO, GITHUB_BRANCH |
| Runtime | POLLING_INTERVAL, MAX_REQUESTS_PER_HOUR |
| MCP Server | MCP_API_KEY, MCP_PORT |

### Security Configuration (config.ini)

All security settings can be configured via config.ini:

```ini
# === Security Configuration ===

# VAF (Input Validation & Filtering)
MAX_STRING_LENGTH=100000
MAX_DEPTH=5
MAX_ARRAY_LENGTH=1000

# Rate Limiting
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_HOUR=1000
MAX_BURST=10

# Path Protection
MAX_PATH_LENGTH=4096
BLOCK_PATH_TRAVERSAL=true

# Audit Logging
AUDIT_LOG=true
AUDIT_FILE=.audit.log
```

MCP server settings (port, API key, require-key) are configured through
the `VANT_MCP_*` environment variables - see below.

### Security Settings Reference

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

### Environment Variable Overrides

Security settings can also be set via environment variables:

```bash
# MCP Security via environment
export VANT_MCP_API_KEY=your-secret-key
export VANT_MCP_REQUIRE_KEY=true
```

## settings.ini

> **Honesty note (pass 193):** no runtime code reads `settings.ini` - the
> table below is the INTENT behind `settings.example.ini`. The values that
> matter are personality/behavior (brain files), AUTO_SAVE/AUTO_PUSH
> (sync settings), and the RAG tuning rows (spec-only, no consumer yet).
> Configure what actually exists today via brain config (`vant config
> set`) or `VANT_*` env vars.

Personality and behavior (brain-file-owned today):

```ini
# Identity
HANDLE=Vant
DISPLAY_NAME=Vant

# Personality (0-100)
DIRECTNESS=70
CURIOSITY=80
PATIENCE=70

# Output
VERBOSITY=normal
EMOJI_ENABLED=true
MARKDOWN_ENABLED=true

# Behavior
AUTO_SAVE=true
AUTO_PUSH=true
NOTIFY_ON_NEW=true
```

| Setting | Range | Description |
|--------|-------|-------------|
| `DIRECTNESS` | 0-100 | Direct vs. hedged responses |
| `CURIOSITY` | 0-100 | Questions asked |
| `PATIENCE` | 0-100 | Wait for input vs. proceed |
| `VERBOSITY` | quiet/normal/verbose | Output detail level |
| `EMOJI_ENABLED` | true/false | Use emoji |
| `MARKDOWN_ENABLED` | true/false | Markdown output |
| `AUTO_SAVE` | true/false | Auto-save brain |
| `AUTO_PUSH` | true/false | Auto-push to GitHub |

### Search (RAG)

Search/MCP tool settings (pass 194: these are LIVE now - `lib/config.js`
exposes RAG getters `ragRehydrateMaxSize`/`ragCompressionThreshold`/
`ragLimitMax`, wired into lib/search.js hydrate/compress/query/limit and
bin/search.js. Bare names like `REHYDRATE_MAX_SIZE` are accepted as env
aliases; canonical env vars are `VANT_RAG_REHYDRATE_MAX_SIZE`,
`VANT_RAG_COMPRESSION_THRESHOLD`, `VANT_RAG_LIMIT_MAX`, brain-config keys
`rag.rehydrateMaxSize`/`rag.compressionThreshold`/`rag.limitMax`):

```ini
# Search (RAG)
REHYDRATE_MAX_SIZE=51200    # bytes, max 1MB
COMPRESSION_THRESHOLD=5120  # bytes trigger for compression hint
RAG_LIMIT_MAX=20             # max results from LTC search
```

| Setting | Default | Description |
|---------|---------|-------------|
| `REHYDRATE_MAX_SIZE` | 50KB | Max rehydrated-context bytes, hard bound (1MB max) |
| `COMPRESSION_THRESHOLD` | 5KB | Compression hint threshold |
| `RAG_LIMIT_MAX` | 20 | Max search results (clamps queryBrain/semanticSearch) |

## mood.ini

> **Honesty note (pass 193):** no runtime code reads `mood.ini` either -
> `mood.example.ini` documents the INTENDED mood-key behavior. Nothing in
> `lib/` implements mood state or its automatic transitions; treat this
> section as a design sketch, not a live feature. Brain persona files are
> the current personality mechanism.

Current state affects responses (as-designed, not implemented):

```ini
# Mood State
MOOD=neutral
ENERGY=medium
SOCIABILITY=medium

# Mood Types (affects response style)
# focused:    Working, task-oriented, brief
# curious:    Exploring, asking questions
# playful:   Joking, casual
# cautious:   Careful, double-checking
# urgent:    Quick, action-focused
# contemplative: Thoughtful, philosophical
```


| Setting | Options | Description |
|--------|---------|-------------|
| `MOOD` | neutral/focused/curious/playful/cautious/urgent/contemplative | Response style |
| `ENERGY` | low/medium/high | Response verbosity |
| `SOCIABILITY` | low/medium/high | Social vs. private |

### Automatic Transitions

- After 30min idle: neutral
- After fail: cautious
- After success: playful

## Example Files (and the truth about them)

See these files in the repo for full examples:

- `.env.example` - Environment template
- `config.example.ini` - Config template (**the only runtime-READ .ini**
  - `bin/sync.js` parses it KEY=value for `GITHUB_REPO`/`GITHUB_BRANCH`,
  `bin/health.js` checks it exists, `lib/config.js` reads `vant.config.js`
  as its JS peer)
- `settings.example.ini` - Settings template (**documentation-only**):
  its HANDLE/personality/VERBOSITY and RAG keys map to *brain config* and
  env keys that `lib/config.js` + the plugins actually read. Copying it to
  `settings.ini` does nothing - no reader exists. Set the equivalent
  `VANT_*` env vars or brain config keys instead (see the four-surface
  precedence table above). As of pass 194 the RAG keys ARE live (`lib/config.js`
  RAG getters + lib/search.js wiring), so `REHYDRATE_MAX_SIZE` etc. are no
  longer spec-only - but prefer the canonical `VANT_RAG_*` names.
- `mood.example.ini` - Mood template (**documentation-only, same caveat**):
  no code reads `mood.ini`; mood-style behavior is a personality concern
  the brain files (identity.md, persona sections) own.


> **Auto-Polling Warning for GitHub.com**: `VANT_AGREE_AUTO_SYNC` enables background GitHub.com polling in `vant node`. This is intended for self-hosted GitLab/Gitea - using with GitHub.com **violates their Terms of Service**. Requires **both**:
> 1. The `--enable-polling` flag when starting node
> 2. Set `VANT_AGREE_AUTO_SYNC=true` (in `.env` or export)
>
> Self-hosted GitLab/Gitea is fine. Use `vant sync` for manual brain updates with GitHub.com. See [CLI Reference](/vant/reference/cli).

See also: [CLI Commands](/vant/reference/cli), [Installation](/vant/getting-started/install)
## Webhooks

```bash
VANT_WEBHOOK_PORT=3456
VANT_WEBHOOK_SECRET=your-secret
VANT_WEBHOOK_URL=https://your-domain.com/webhook
```

## Notifications

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=user@gmail.com
SMTP_PASS=app-password
FROM_EMAIL=Vant <noreply@vant.dev>

# Pushover
PUSHOVER_KEY=user-key
PUSHOVER_TOKEN=app-token

# Telegram
TELEGRAM_TOKEN=bot-token
```

## Linear

```bash
LINEAR_API_KEY=your-api-key
LINEAR_TEAM=team-id
LINEAR_ENDPOINT=https://api.linear.app/graphql
```

## MCP Tools

```bash
MCP_PORT=3457
MCP_HOST=localhost
```