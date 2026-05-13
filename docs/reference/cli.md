---
version: 0.8.11
permalink: /reference/cli
layout: default
title: CLI Reference
nav_order: 80
---
# CLI Reference

All Vant CLI commands.

## Core Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain (default: `$MODEL_PATH` or models/private)
| `vant run` | Start runtime loop |
| `vant vibe` | Get/set runtime mood (experimental, focused, safety_first, etc) |

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

Load brain from your brain folder (default: `$MODEL_PATH` or `models/private/`):
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
vant node --mcp-port 3100  # Custom MCP port
```

> ⚠️ **Auto-Polling Opt-In (for Self-Hosted)**: By default, `vant node` does NOT poll GitHub. To enable background sync:
> 
> - Flag: `--enable-polling` 
> - Env var: `VANT_AGREE_AUTO_SYNC=true`
> - Or type "AGREE" when prompted
> 
> ⚠️ **This violates GitHub.com ToS** - intended for self-hosted GitLab/Gitea only. Use `vant sync` for manual brain sync with GitHub.com.

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
| `vant lock` | Brain write lock (acquire/release/status) |
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

#### vant lock

Brain write lock for multi-agent safety. Prevents race conditions when multiple agents try to write to brain simultaneously.

```bash
vant lock acquire   # Acquire lock for writes
vant lock release   # Release lock
vant lock status   # Show lock status
vant lock force    # Force release (admin)
```

**Using in code:**

```javascript
const brain = require('vant').brain;

// Simple: acquire lock, do work, release
const token = await brain.acquireBrainLock();
if (token) {
    brain.write('learnings', 'new-lesson', '# My lesson content');
    await brain.releaseBrainLock(token);
}

// Safer: withLock helper handles release
await brain.withLock(async () => {
    brain.write('learnings', 'new-lesson', '# Content');
});
```

**Lock behavior:**
- Auto-expires after 1 hour if not released
- Uses exponential backoff for contention
- Token required for secure release

#### vant bump

Bump version:

```bash
vant bump         # Patch (0.8.6 → 0.8.5)
vant bump minor  # Minor (0.8.6 → 0.9.0)
vant bump major  # Major (0.8.6 → 1.0.0)
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

See also: [Configuration](reference/configuration), [API](reference/cli), [Entropy Patching](reference/entropy)

## compress

Entropy encoder for Vant brain files. Creates `.vpatch` files from markdown.

### vant compress

```bash
vant compress <input> [options]
```

| Option | Alias | Description |
|--------|------|-------------|
| `--output` | `-o` | Output directory (default: models/latent) |
| `--window` | `-w` | Window size (default: 8) |
| `--threshold` | `-t` | Entropy threshold 0-1 (default: 0.85) |
| `--adaptive` | `-a` | Enable adaptive threshold (auto μ + k×σ) |
| `--sensitivity` | `-k` | k-factor for threshold (default: 1.5) |
| `--stats` | `-s` | Show entropy statistics only |
| `--decompress` | `-d` | Decompress .vpatch to original |

### Examples

```bash
# Compress a file (use $MODEL_PATH or models/private/)
vant compress ${MODEL_PATH:-models/private}/goals.md

# View entropy stats
vant compress ${MODEL_PATH:-models/private}/goals.md --stats

# Adaptive mode (self-calibrating threshold)
vant compress ${MODEL_PATH:-models/private}/goals.md --adaptive
vant compress ${MODEL_PATH:-models/private}/goals.md -a -k 2.0

# Decompress
vant compress models/latent/goals.vpatch --decompress
```

See also: [Entropy Patching](reference/entropy)

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
## Utility Commands

Additional CLI commands for specific tasks.

### vant audit

Generate an audit report - security, health, deps:

```bash
vant audit              # Full report
vant audit --json      # JSON output
```

### vant bot

Run Telegram bot:

```bash
vant bot              # Start bot
vant bot --test     # Test mode
```

### vant bump

Bump version and create git tag:

```bash
vant bump patch      # 0.8.6 → 0.8.6
vant bump minor     # 0.8.6 → 0.9.0
vant bump major    # 0.8.6 → 1.0.0
```

### vant compress

Compress brain to patches:

```bash
vant compress input.png "Secret message" -o output.png
vant compress input.png "msg" -o out.png --encrypt password
```

### vant rate

Show GitHub API rate limit:

```bash
vant rate           # Current remaining
vant rate --json   # JSON output
```

### vant resolution

Manage resolutions:

```bash
vant resolution --list     # List all
vant resolution --add key "content"
 vant resolution --rm key
```

### vant succession

Show commit history:

```bash
vant succession           # Last 10 commits
vant succession 20     # Last N commits
```

### vant summary

Show brain summary:

```bash
vant summary          # Stats + info
vant summary --json # JSON
```

### vant update

Check for updates:

```bash
vant update         # Check version
vant update --force # Force update
```

## Webhook Commands

```bash
vant webhook serve             # Start webhook server
vant webhook register <name> <source>  # Register webhook
vant webhook list            # List webhooks
vant webhook send <url> <payload>   # Send webhook
```

## Notification Commands

```bash
vant notify slack "message"    # Send Slack notification
vant notify discord "message" # Send Discord notification
```

## Linear Commands (when island loaded)

```bash
vant linear issues            # List issues
vant linear create "title"   # Create issue
vant linear comment <id> "body"  # Add comment
```

## Development Commands

| Command | Description |
|---------|-------------|
| `vant search` | Search brain files (basic/rag/hybrid) |
| `vant rerank` | Rerank search results |
| `vant prune` | Clean up old/stale brain files |

### vant prune

Clean up old or stale brain files:

```bash
vant prune -h, --help           # Show help
vant prune -d, --dry-run       # Preview without changes
vant prune -f, --force        # Force prune without confirmation
vant prune -D, --daemon      # Run as background daemon
vant prune -s, --stats       # Show prune statistics
vant prune -l, --list        # List prunable files
```

### vant search

Search brain files:

```bash
vant search <query>          # Basic search
vant search --rag <query>    # RAG search (semantic)
vant search --hybrid <query> # Hybrid search (BM25 + vector + RRF)
vant search --rerank         # Rerank results
```

### vant rerank

Rerank search results:

```bash
vant rerank <results.json>    # Rerank results file
vant rerank --query "query"  # Query for reranking
```

## Infrastructure Commands

| Command | Description |
|---------|-------------|
| `vant repos` | Manage multiple brain repositories |
| `vant islands-boot` | Initialize islands |
| `vant validate` | Validate brain files |

### vant repos

Manage multiple repositories:

```bash
vant repos list               # List configured repos
vant repos add <name> <url>  # Add new repository
vant repos remove <name>    # Remove repository
vant repos sync <name>      # Sync specific repo
```

### vant islands-boot

Initialize islands:

```bash
vant islands-boot            # Initialize all islands
vant islands-boot <island>   # Initialize specific island
```

### vant validate

Validate brain files:

```bash
vant validate                # Validate all files
vant validate --schema      # Schema validation
vant validate --integrity  # Check file integrity
```

## Testing Commands

| Command | Description |
|---------|-------------|
| `vant test-all` | Run all tests |
| `vant test-core` | Run core tests |

### vant test-all

Run all tests:

```bash
vant test-all                # Run all tests
vant test-all --verbose     # Verbose output
```

### vant test-core

Run core Vant tests:

```bash
vant test-core              # Run core tests
vant test-core --coverage   # With coverage
```

## Stego Commands

| Command | Description |
|---------|-------------|
| `vant stego` | Encode/decode data in images |

### vant stego

Steganography - encode/decode data in images:

```bash
vant stego encode <input.txt> <image.png>  # Encode text in image
vant stego decode <stego.png>              # Decode from image
vant stego --RGBA                         # Use RGBA encoding (4x capacity)
vant stego --multi                        # Split across multiple images
```

## Sync Commands

| Command | Description |
|---------|-------------|
| `vant hybrid-sync` | Public/private brain sync |

### vant hybrid-sync

Hybrid sync between public and private brains:

```bash
vant hybrid-sync -h, --help         # Show help
vant hybrid-sync -p, --public    # Sync public brain only
vant hybrid-sync -r, --private   # Sync private brain only
```

## Docs Commands

| Command | Description |
|---------|-------------|
| `vant docs` | Build docs |
| `vant docs-build` | Build docs (detailed) |

### vant docs-build

Build documentation:

```bash
vant docs-build                # Build docs
vant docs-build --version 0.9.0 # Specific version
```

## Boot Commands

| Command | Description |
|---------|-------------|
| `vant boot` | System bootstrap |

### vant boot

Bootstrap Vant system:

```bash
vant boot                  # Full bootstrap
vant boot --init           # Initialize from scratch
vant boot --verify         # Verify installation
```

## Main Entry

| Command | Description |
|---------|-------------|
| `vant` | Main entry point |

### vant

Main Vant CLI entry:

```bash
vant                      # Show version
vant -h, --help           # Show help
vant --version            # Show version
```