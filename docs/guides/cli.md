---
version: 0.8.6
permalink: /guides/cli
layout: default
title: CLI Reference
nav_order: 5
---
# CLI Reference

All Vant commands.

---

## Core Commands

| Command | Use For |
|---------|---------|
| vant start | Full startup |
| vant health | Check system |
| vant sync | Pull/push brain |
| vant load | Load brain |
| vant onboard | Browse brain |

---

## Options

### health

System diagnostics. Checks GitHub API, brain files, and config.

```bash
vant health          # Full output with all checks
vant health --quiet  # Minimal output - just pass/fail
```

**What it does:** Verifies your GitHub token works, brain directory exists, and all files are readable.

### sync

Push local changes to GitHub and pull remote changes down.

```bash
vant sync           # Bidirectional sync (pull + push)
vant sync --pull    # Pull remote changes only
vant sync --push    # Push local changes only
```

**What it does:** Merges brain files with GitHub. Resolves conflicts by keeping both versions.

---

## MCP

Model Context Protocol server - lets other toolstalk to Vant.

```bash
vant mcp --server           # Start HTTP server (default port 3000)
vant mcp --stdio           # STDIO mode for Claude/OpenAI integration
vant mcp --server --port 3456  # Custom port
```

**What it does:** Runs an MCP-compatible server so external AI agents can query your brain.

---

## Branch

Git branches let multiple agents work in parallel without interference.

```bash
vant branch list         # Show all branches
vant branch checkout    # Switch to another branch
vant branch create      # Create new branch
```

**What it does:** Wrapper around `git branch/checkout`. Your branch is your workspace.

---

## Succession

Trust levels control how much freedom you have. Check on wake-up.

```bash
vant succession            # Show current version + trust level
vant succession trust high # Set trust to high (full autonomy)
```

**What it does:** Reads/writes `_succession.json`. Higher trust = fewer questions to ask.

---

## Other

```bash
vant rate          # Show GitHub API rate limit remaining
vant update       # Check for Vant updates
vant setup        # Initial setup wizard
```

**What each does:**
- `rate` - Tells you how many API calls left this hour
- `update` - Checks github.com/dhaupin/vant for new releases
- `setup` - Interactive wizard to configure .env

---

## Related

- [Operations](operations) - CLI commands
- [AI Onboarding](ai-onboard) - Getting started
