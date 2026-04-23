---
permalink: /reference/cli.html
layout: default
title: CLI Reference
---
# CLI Reference

All Vant CLI commands.

## Core Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain from models/public |
| `vant run` | Start runtime loop |

### Core Details
Core CLI commands.

#### vant start

Full startup sequence:
1. `health` - Run diagnostics
2. `sync` - Pull/push brain from GitHub
3. `load` - Load brain files
4. `run` - Start runtime loop

```bash
vant start           # Full startup
vant start --no-sync # Skip sync
vant start --local  # Skip GitHub
```

#### vant health

Run system diagnostics:
- Check config files
- Verify GitHub connection
- Check brain files
- Validate .env

```bash
vant health          # Full check
vant health --quiet # Minimal output
```

#### vant sync

Sync brain with GitHub:
- Pull remote changes
- Commit local changes
- Push to remote

```bash
vant sync              # Pull + push
vant sync --pull      # Pull only
vant sync --push      # Push only
vant sync --force     # Force push
```

#### vant load

Load brain from `models/public/`:
- Load all .md files
- Parse _succession.json
- Update memory

```bash
vant load            # Load all
vant load identity  # Reload identity only
```

#### vant run

Start runtime loop:
- Wait for input
- Process and respond
- Auto-save brain

```bash
vant run             # Interactive loop
vant run --mcp      # MCP mode
vant run --websocket # WebSocket mode
```

## Development

| Command | Description |
|---------|-------------|
| `vant test` | Run build/tests |
| `vant watch` | Monitor GitHub for changes |
| `vant bot` | Run Telegram bot |

### Development Details
Development commands.

#### vant test

Build and test:
- Lint code
- Run tests
- Build dist/

```bash
vant test           # Run all
vant test --lint   # Lint only
vant test --build  # Build only
```

#### vant watch

File watcher for changes:
- Watch bin/, lib/
- Auto-reload on changes

```bash
vant watch             # Watch + reload
vant watch --no-reload # Watch only
```

#### vant bot

Telegram bot for brain queries:

```bash
TELEGRAM_BOT_TOKEN=xxx vant bot
# Commands:
#   /start - Welcome
#   /status - VANT status
#   /brain - Brain version
#   /health - Health check
#   /sync - Trigger sync
```

Example:

## Setup & Config

| Command | Description |
|---------|-------------|
| `vant setup` | Interactive setup wizard |
| `vant update` | Check for new releases |
| `vant test` | Run test suite |
| `vant build-test` | Run build validation |

### Setup Details
Initial setup.

#### vant setup

Interactive setup:
- Create config.ini
- Create .env
- Optionally create settings.ini, mood.ini

```bash
vant setup          # Interactive
vant setup --force # Overwrite existing
```

#### vant update

Check for updates:
- Compare local to remote
- Show changelog
- Prompt to upgrade

```bash
vant update           # Check
vant update --install # Install if available
```

#### vant test

Run test suite:

```bash
vant test              # Run all tests
vant test --coverage  # With coverage
vant test lib/        # Specific path
```

#### vant build-test

Run build validation tests:

```bash
vant build-test       # Validate all scripts load
```

## Help & Info

| Command | Description |
|---------|-------------|
| `vant help` | Show all commands |
| `vant help <cmd>` | Help for specific command |
| `vant changelog` | View recent changes |
| `vant summary` | Session summary |
| `vant rate` | GitHub API rate limit |

### Help Details
Help commands.

#### vant help

Show help:

```bash
vant help           # All commands
vant help start    # Start command
vant help --json  # JSON output
```

#### vant changelog

View recent commits:

```bash
vant changelog           # Last 10
vant changelog --full    # Full history
vant changelog v0.8.0   # Since version
```

#### vant summary

Session statistics:

```bash
vant summary       # This session
vant summary all  # All time
```

#### vant rate

GitHub API rate status:

```bash
vant rate         # Current limit
vant rate reset  # Time until reset
```

## Node & MCP

| Command | Description |
|---------|-------------|
| `vant node` | Run as persistent node |
| `vant node --mcp` | Node + MCP server |
| `vant mcp` | Run MCP server |

### Node Details
Run as node.

#### vant node

**Persistent node** - runs Vant continuously with brain loaded.

```bash
vant node              # Persistent mode (manual sync)
vant node --mcp        # Node + MCP server
vant node --mcp-port 3457  # Custom MCP port
```

> ⚠️ **Auto-Polling Opt-In**: By default, `vant node` does NOT poll GitHub. To enable background sync:
> 
> - Flag: `--enable-polling` 
> - Env var: `VANT_AGREE_AUTO_SYNC=true`
> - Or type "AGREE" when prompted
> 
> This is intentional - GitHub ToS prohibits automated polling. Use `vant sync` for manual brain sync.

#### vant mcp

Standalone MCP server:

```bash
vant mcp              # Default port
vant mcp --stdio      # STDIO mode
vant mcp --websocket # WebSocket
```

## Advanced

| Command | Description |
|---------|-------------|
| `vant onboard` | Browse knowledge base |
| `vant succession` | Brain version/trust |
| `vant resolution` | Mark thoughts resolved |
| `vant bump` | Bump version & tag |

### Advanced Details
Advanced commands.

#### vant onboard

Browse knowledge base:

```bash
vant onboard          # Interactive browse
vant onboard identity # Query identity
vant onboard --list   # List files
```

#### vant succession

Brain version tracking:

```bash
vant succession      # Current version
vant succession trust # Mark trusted
vant succession diff # vs previous
```

#### vant resolution

Mark thoughts resolved:

```bash
vant resolution          # Interactive
vant resolution resolve # Mark resolved
vant resolution list     # List unresolved
```

#### vant bump

Bump version:

```bash
vant bump         # Patch (0.8.4 → 0.8.5)
vant bump minor  # Minor (0.8.4 → 0.9.0)
vant bump major  # Major (0.8.4 → 1.0.0)
```

## Docs

| Command | Description |
|---------|-------------|
| `vant docs` | Build docs for release |
| `vant docs serve` | Serve docs locally |

### Docs Details
Docs commands.

#### vant docs

Build documentation:

```bash
vant docs build           # Build for release
vant docs build --version # Specific version
vant docs serve          # Local server
```

See also: [Configuration](/vant/reference/configuration.html), [API](/vant/reference/api.html)

---

## FAQ
Frequently asked questions answered.

### Which command do I start with?

`vant start` - Full startup (health → sync → load → run)

### How do I check if everything is working?

`vant health` - Runs diagnostics

### How do I save my brain?

`vant sync` - Pulls latest + pushes changes

### How do I see my rate limit?

`vant rate` - Shows GitHub API remaining

### How do I update Vant?

`vant update` - Checks for new versions

### How do I run tests?

`vant test` - Runs build tests