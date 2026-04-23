---
permalink: /reference/configuration.html
layout: default
title: Configuration
---
# Configuration

All configuration files for Vant.

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

## Additional Environment Variables
Configuration via environment.

### MCP Server

| Variable | Required | Description |
|----------|----------|-------------|
| `VANT_MCP_PORT` | No | MCP server port (default: 3456) |
| `VANT_MCP_API_KEY` | No | API key for MCP authentication |
| `VANT_AGREE_AUTO_SYNC` | No | **⚠️** Enable auto-polling: set to `"true"` to confirm (see notes) |
| `MCP_API_KEY` | No | Alternative MCP API key |

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
| `MODEL_PATH` | No | Path to brain files (default: models/public) |

## config.ini

Core configuration:

```ini
# Core
VANT_VERSION=v0.8.4
MODEL_PATH=models/public
STATE_PATH=states/active/current.json

# GitHub (set via environment variable)
GITHUB_REPO=your-username/your-repo
GITHUB_BRANCH=main

# Runtime
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360

# MCP Server (optional)
MCP_API_KEY=your-secret-api-key
MCP_PORT=3456
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

# MCP Server Security
MCP_REQUIRE_API_KEY=false
MCP_TIMEOUT=30000
MCP_MAX_INPUT_SIZE=1048576
MCP_MAX_CONCURRENT=3
MCP_CIRCUIT_BREAK_THRESHOLD=5
MCP_CIRCUIT_BREAK_WINDOW=60000
```

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
| **MCP Security** |||
| MCP_REQUIRE_API_KEY | false | Force API key |
| MCP_TIMEOUT | 30000 | Request timeout (ms) |
| MCP_MAX_INPUT_SIZE | 1048576 | Max input (1MB) |
| MCP_MAX_CONCURRENT | 3 | Parallel requests |
| MCP_CIRCUIT_BREAK_THRESHOLD | 5 | Failures before block |
| MCP_CIRCUIT_BREAK_WINDOW | 60000 | Failure window (ms) |

### Environment Variable Overrides

Security settings can also be set via environment variables:

```bash
# MCP Security via environment
export VANT_MCP_API_KEY=your-secret-key
export VANT_MCP_REQUIRE_API_KEY=true
export MCP_TIMEOUT=15000
export MCP_MAX_CONCURRENT=2
export MCP_CIRCUIT_BREAK_THRESHOLD=3
```

## settings.ini

Personality and behavior:

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

## mood.ini

Current state affects responses:

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

## Example Files

See these files in the repo for full examples:

- `.env.example` - Environment template
- `config.example.ini` - Config template
- `settings.example.ini` - Settings template
- `mood.example.ini` - Mood template

> ⚠️ **Auto-Polling Note**: `VANT_AGREE_AUTO_SYNC` enables background GitHub polling in `vant node`. This requires **both**:
> 1. The `--enable-polling` flag when starting node
> 2. Set `VANT_AGREE_AUTO_SYNC=true` (in `.env` or export)
> 
> This exists because GitHub ToS prohibits automated polling. Use `vant sync` for manual brain updates instead. See [CLI Reference](/vant/reference/cli.html).

See also: [CLI Commands](/vant/reference/cli.html), [Installation](/vant/getting-started/install.html)