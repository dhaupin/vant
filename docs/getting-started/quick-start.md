---
version: 0.8.4
title: Quick Start
slug: /quick-start
order: 2
---

# Quick Start

Get Vant running in 2 minutes.

## 1. Install

\`\`\`bash
npm install -g vant
# Or use directly
node bin/vant.js start
\`\`\`

## 2. Configure

Copy `.env.example` to `.env`:
- `VANT_GITHUB_REPO` - Your fork
- `VANT_GITHUB_TOKEN` - GitHub PAT

## 3. Run

\`\`\`bash
vant setup      # Interactive setup
vant health    # Verify system
vant load      # Load brain
vant start     # Full startup
\`\`\`

## What's Next?

- [CLI Commands](../reference/cli) - Full reference
- [Configuration](../reference/configuration) - Customize Vant
- [Architecture](../guides/architecture) - How it works
