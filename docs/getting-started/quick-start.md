---
version: 0.8.6
permalink: /getting-started/quick-start
layout: default
title: Quick Start
nav_order: 11
description: Install Vant, configure GitHub sync, and run your first start in about two minutes.
---
# Quick Start

> Get Vant running in 2 minutes

## 1. Install

Install Vant globally:

```bash
npm install -g vant
```

Or run directly without installing:

```bash
node bin/vant.js start
```

## 2. Configure

Create a `.env` file with your GitHub credentials (a token with repo
scope; the brain repo can be any GitHub repo you own):

```bash
VANT_GITHUB_REPO=your-username/your-brain-repo
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

Or run interactive setup:

```bash
vant setup
```

## 3. Run

Start Vant to load your brain and begin:

```bash
vant start     # Full startup (migrate, health, sync, load, run)
vant health    # Verify system setup
vant load      # Load brain from previous session
vant sync      # Push brain changes to GitHub
```

## What's Next?

- [Agent Onboarding](/vant/getting-started/agent-onboarding) - the wake, work, sleep loop for agents
- [The Brain](/vant/memory/brain) - what the memory files are and where they live
- [MCP Server](/vant/runtime/mcp) - connect any MCP client
- [CLI Reference](/vant/reference/cli) - all commands