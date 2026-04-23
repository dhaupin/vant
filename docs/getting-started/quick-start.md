---
permalink: /getting-started/quick-start.html
layout: default
title: Quick Start
---
# Quick Start

> Get Vant running in 2 minutes

## 1. Install

```bash
npm install -g vant
```

Or run directly without installing:

```bash
node bin/vant.js start
```

## 2. Configure

Create a `.env` file with your GitHub credentials:

```bash
VANT_GITHUB_REPO=your-username/your-brain-repo
VANT_GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

Or run interactive setup:

```bash
vant setup
```

## 3. Run

```bash
vant start     # Full startup (health → sync → load → run)
vant health   # Verify system setup
vant load    # Load brain from previous session
vant sync   # Push brain changes to GitHub
```

## What's Next?

- [Build Your First Agent](../tutorials/build-agent) - 15 min tutorial
- [CLI Reference](../reference/cli) - All commands
- [Configuration](../reference/configuration) - Customize Vant