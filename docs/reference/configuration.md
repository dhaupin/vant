---
permalink: /configuration.html
---


---
version: 0.8.4
title: Configuration
slug: /configuration
order: 4
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

## config.ini

Core configuration:

```ini
# Core
vant_VERSION=v0.8.4
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
| Core | vant_VERSION, MODEL_PATH, STATE_PATH |
| GitHub | GITHUB_REPO, GITHUB_BRANCH |
| Runtime | POLLING_INTERVAL, MAX_REQUESTS_PER_HOUR |
| MCP Server | MCP_API_KEY, MCP_PORT |

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

See also: [CLI Commands](./cli.md), [Installation](../getting-started/install.md)