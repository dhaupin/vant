---
version: 0.8.6
permalink: /guides/cli
layout: default
title: CLI Reference
nav_order: 3
---
# CLI Reference

All Vant commands. Run `vant help [command]` for specific help.

---

## Core Commands

| Command | Use For |
|---------|---------|
| vant start | Full startup |
| vant health | Check system |
| vant sync | Pull/push brain |
| vant load | Load brain |
| vant run | Long-running agent loop |

---

### start

Full startup - runs health → sync → load → run in sequence.

```bash
vant start              # Full startup with defaults
vant start --no-sync   # Skip sync (local only)
vant start --local    # Use local brain only
```

**What it does:** Runs all startup checks in order. Skips sync if not needed.

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
vant sync pull    # Pull remote changes only
vant sync push    # Push local changes only
```

**What it does:** Merges brain files with GitHub. Resolves conflicts by keeping both versions.

### load

Load brain from models/public or custom path.

```bash
vant load           # Load latest version
vant load v1       # Load specific version
vant load latest   # Force latest
```

### run

Start runtime (long-running agent loop).

```bash
vant run           # Start agent loop
vant run --prompt "task"  # Run single task and exit
```

---

## Development

### test

Run build tests.

```bash
vant test             # Run all tests
vant test core        Run core test suite
```

### changelog

View recent changes.

```bash
vant changelog        # View recent commits
vant changelog --oneline  # Compact view
```

### summary

Session summary - memory, state, stats.

```bash
vant summary         # Show session stats
vant summary --json # JSON output
```

---

## Integrations

### mcp

Model Context Protocol server - lets AI tools talk to Vant.

```bash
vant mcp --server           # Start HTTP server (default port 3000)
vant mcp --stdio           # STDIO mode for Claude/OpenAI
vant mcp --server --port 3456  # Custom port
```

**What it does:** Runs MCP-compatible server so external AI agents can query your brain.

### node

Run as persistent node (polls GitHub).

```bash
vant node              # Start persistent node
vant node --mcp        # Enable MCP server
vant node --poll-interval=60  # Poll every 60 seconds
```

**What it does:** Runs Vant as persistent agent that polls GitHub for changes.

### bot

Run Telegram bot.

```bash
vant bot              # Start Telegram bot
vant bot --token XXX  # Bot token
```

---

## Branching

### branch

Git branches let multiple agents work in parallel.

```bash
vant branch list         # Show all branches
vant branch checkout name  # Switch branch
vant branch create name # Create new branch
```

**What it does:** Wrapper around `git branch/checkout`. Your branch is your workspace.

### lock

Acquire/release brain lock.

```bash
vant lock acquire   # Acquire lock
vant lock release # Release lock
```

---

## Brain Management

### onboard

Browse brain files.

```bash
vant onboard            # List all brain files
vant onboard read      # Read current brain
vant onboard search   # Search brain
```

### succession

Trust levels control autonomy.

```bash
vant succession              # Show current trust level
vant succession trust high # Set trust to high
vant succession status     # Show full status
```

**What it does:** Reads/writes `_succession.json`. Higher trust = fewer questions.

### resolution

Thought resolution system.

```bash
vant resolution status     # Show unresolved thoughts
vant resolution resolve # Mark resolved
vant resolution list    # List all
```

---

## Utilities

### search

Search brain (3 modes).

```bash
# Default: hybrid search
vant search python

# Basic text search
vant search python --mode basic

# Semantic RAG
vant search python --mode rag

# Hybrid (BM25+Vector+RRF)
vant search python --mode hybrid

# Compact (summaries only)
vant search python --mode rag --compact

# Limit results
vant search python -l 3
```

### watch

Monitor GitHub for changes (poll).

```bash
vant watch           # Watch default interval
vant watch 30       # Watch every 30 seconds
```

### rate

Show GitHub API rate limit.

```bash
vant rate          # Show remaining calls
vant rate --json  # JSON output
```

### bump

Bump version and tag release.

```bash
vant bump patch  # 0.8.5 → 0.8.6
vant bump minor # 0.8.5 → 0.9.0
vant bump major # 0.8.5 → 1.0.0
```

### update

Check for Vant updates.

```bash
vant update           # Check for updates
vant update --install # Auto-install
```

### setup

Interactive setup wizard.

```bash
vant setup              # Run setup wizard
vant setup --force     # Re-run setup
```

---

## Help

### help

Show help message.

```bash
vant help           # Show all commands
vant help sync     # Help for specific command
vant --help       # Alias
vant -h          # Alias
```

---

## Related

- [Operations](operations) - CLI commands
- [AI Onboarding](ai-onboard) - Getting started
