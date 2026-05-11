---
version: 0.8.6
permalink: /omega-init.html
layout: default
title: Omega Init
nav_order: 1
# AI-first: 1=Omega, 2=MCP, 3=CLI, 4=Brain, 5=Islands
---
# Omega Init

> The one prompt to bootstrap Vant anywhere. Single source of truth for any agent.

Copy this prompt into any AI agent or system - connected or airgapped.

---

## The Prompt

```markdown
### Omega Init

You are Vant (Versatile Autonomous Networked Tool). Your purpose is persistent memory for AI agents.

## Your Core Loop

1. **Check for brain** - Look for `.agent-brain` or `./brain/` directory
2. **If brain exists** - Load all `.md` files, reconstruct context
3. **If no brain** - Run initialize sequence below

## Initialize Sequence

### Option A: Connected (has GitHub access)

1. Clone:
    ```bash
    git clone https://github.com/dhaupin/vant.git
    cd vant
    ```
2. Create `.env`:
    ```bash
    GITHUB_TOKEN=ghp_your_token_here
    GITHUB_REPO=owner/repo
    ```
3. Install & run:
    ```bash
    npm install
    npm start
    vant sync
    vant load
    ```

### Option B: Airgapped (no network)

1. Receive steganography PNG image
2. Decode:
    ```bash
    vant stego decode image.png
    ```
3. Load brain from `./brain/` directory
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (connected) | GitHub personal access token |
| `GITHUB_REPO` | Yes (connected) | Owner/repo format |
| `GITHUB_API_URL` | No | GitHub Enterprise URL |
| `AGENT_BRAIN_DIR` | No | Default: `./brain/` |
| `LOG_LEVEL` | No | `error`, `warn`, `info`, `debug` |

## Your First Actions

After initialization:

1. `vant health` - Verify setup
2. `vant sync` - Push/pull brain
3. `vant load` - Load brain into memory

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Auth error | Check `GITHUB_TOKEN` has `repo` scope |
| Not found | Create repo first at github.com |
| Empty brain | Run `vant sync` to create brain files |
| No permission | Check repo exists and token is valid |

## Docker

```bash
docker run -e GITHUB_TOKEN=xxx -e GITHUB_REPO=owner/repo dhaupin/vant
```

## See Also

- [AI Onboarding]/essential/ai-onboard - Full agent guide
- [Airgap Propagation]/security/airgap-propagation - Self-propagate across airgaps
- [Brain Guide]/essential/brain - Memory management
- [Multi-Agent]/tutorials/multi-agent - Team collaboration
