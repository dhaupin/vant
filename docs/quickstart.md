---
permalink: /quickstart.html
layout: default
title: Quickstart
---

# Vant Quickstart

> 5-minute setup for AI agent memory persistence

## Installation

```bash
npm install -g vant
```

## Setup

```bash
# Configure your brain repo
vant setup

# Enter when prompted:
# - GitHub token (create at github.com/settings/tokens)
# - Brain repo (create a new private repo)
# - Branch (default: main)
```

## Usage

```bash
# Start persistent node
vant node

# Load brain from previous session
vant load

# Save and push brain
vant sync
```

## Key Commands

| Command | Description |
|---------|------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant node` | Run persistent node |
| `vant sync` | Push brain to GitHub |
| `vant load` | Load brain from GitHub |
| `vant health` | Check system health |

## Config File

```json
{
  "brainRepo": "your-org/your-brain",
  "branch": "main",
  "autoUpdate": true
}
```

## Next Steps

- [Install Guide](/getting-started/install.html) - Full installation details
- [Architecture](/guides/architecture.html) - How it works
- [CLI Reference](/reference/cli.html) - All commands