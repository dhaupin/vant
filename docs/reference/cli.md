---
version: 0.8.9
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
| `vant help` | Show help |
| `vant setup` | Initial setup |

### vant setup

Initial Vant setup:

```bash
vant setup              # Interactive setup
vant setup --force     # Overwrite existing config
```

### vant help

Show help:

```bash
vant help              # Show all commands
vant help <command>   # Show command help
```

### vant vibe

Get/set runtime mood:

```bash
vant vibe              # Show current vibe
vant vibe focused     # Set vibe to focused
vant vibe experimental # Set vibe to experimental
```

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
| `vant api` | API server |
| `vant auth` | Authentication |
| `vant config` | Configuration |
| `vant connector` | External services |

### vant api

API server:

```bash
vant api                 # Start API server
vant api --port 3456  # Custom port
vant api --secure     # HTTPS mode
```

### vant auth

Authentication:

```bash
vant auth               # Show auth status
vant auth --login     # Login
vant auth --logout    # Logout
```

### vant config

Configuration management:

```bash
vant config              # Show config
vant config get key   # Get value
vant config set key   # Set value
```

### vant connector

External services connector:

```bash
vant connector           # List connectors
vant connector add name # Add connector
vant connector remove   # Remove connector
```

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

### vant canvas

Visualization tools:

```bash
vant canvas             # Show canvas
vant canvas render     # Render visualization
vant canvas export     # Export canvas
```

### vant compute

Multi-language runner:

```bash
vant compute            # Show compute status
vant compute run lang  # Run code
vant compute eval     # Evaluate expression
```

### vant format

Format detection and conversion:

```bash
vant format             # Detect format
vant format convert    # Convert format
vant format validate  # Validate format
```

### vant geometry

Geometry utilities:

```bash
vant geometry           # Show tools
vant geometry calc    # Calculate
vant geometry render  # Render shape
```

### vant nature

Nature/entropy utilities:

```bash
vant nature            # Show entropy tools
vant nature analyze   # Analyze
vant nature generate  # Generate
```

### vant rls

Row-level security:

```bash
vant rls               # Show RLS status
vant rls enable       # Enable RLS
vant rls disable      # Disable RLS
```

### vant rules

Rule management:

```bash
vant rules             # List rules
vant rules add        # Add rule
vant rules remove     # Remove rule
```

### vant shell

Shell operations:

```bash
vant shell             # Open shell
vant shell --cmd     # Run command
vant shell --script  # Run script
```

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

### vant changelog

View changes:

```bash
vant changelog           # View changelog
vant changelog --since  # Since version
vant changelog --json   # JSON output
```

### vant citations

Citation management:

```bash
vant citations           # List citations
vant citations add     # Add citation
vant citations format  # Format citations
```

### vant clean

Unified cleanup:

```bash
vant clean              # Show cleanup options
vant clean --dry-run   # Preview changes
vant clean --force     # Execute cleanup
vant clean --auto     # Auto-cleanup
vant clean --setup-cron # Setup cron job
```

### vant error

Error handling:

```bash
vant error              # Show errors
vant error --list      # List errors
vant error --clear    # Clear errors
```

### vant schema

Schema validation:

```bash
vant schema             # Validate schema
vant schema --check   # Check schema
vant schema --fix     # Fix schema issues
```

### vant telegram

Telegram bot:

```bash
vant telegram           # Start Telegram bot
vant telegram --token  # Set token
vant telegram --chat   # Set chat
```

### vant watch

Poll GitHub for changes:

```bash
vant watch             # Watch for changes
vant watch --interval # Set interval
vant watch --quiet    # Quiet mode
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

## Storage Commands

| Command | Description |
|---------|-------------|
| `vant storage` | Storage operations |
| `vant stream` | Stream operations |
| `vant cache` | Cache management |
| `vant tmp` | Temp file management |

### vant storage

Storage operations:

```bash
vant storage              # Show storage status
vant storage --stats    # Storage statistics
vant storage --clear    # Clear storage
```

### vant stream

Stream operations:

```bash
vant stream              # Show streams
vant stream --list      # List active streams
vant stream --close id  # Close stream
```

### vant cache

Cache management:

```bash
vant cache               # Show cache
vant cache --clear     # Clear all cache
vant cache --compress  # Compress cache
```

### vant tmp

Temp file management:

```bash
vant tmp                 # Show temp files
vant tmp --clear       # Clear temp files
vant tmp --list        # List temp files
```

## Network Commands

| Command | Description |
|---------|-------------|
| `vant server` | HTTP/HTTPS server |
| `vant network` | Network operations |
| `vant node` | Persistent node |
| `vant nodes` | Peer discovery |
| `vant remote` | Remote operations |

### vant server

HTTP/HTTPS server:

```bash
vant server              # Start server
vant server --port 8080 # Custom port
vant server --secure    # HTTPS mode
```

### vant network

Network operations:

```bash
vant network             # Show network status
vant network --connect  # Connect to peers
vant network --disconnect # Disconnect
```

### vant node

Persistent node:

```bash
vant node                # Start node
vant node --name mynode # Named node
vant node --port 3100  # Custom port
```

### vant nodes

Peer discovery:

```bash
vant nodes               # List peers
vant nodes --online    # Online only
vant nodes --all      # All peers
```

### vant remote

Remote operations:

```bash
vant remote             # Show remotes
vant remote add name url # Add remote
vant remote remove name # Remove remote
```

## Messaging Commands

| Command | Description |
|---------|-------------|
| `vant msg` | Messaging system |
| `vant event` | Event handling |

### vant msg

Messaging system:

```bash
vant msg                  # Show messages
vant msg send user msg  # Send message
vant msg --read         # Read messages
```

### vant event

Event handling:

```bash
vant event               # Show events
vant event --emit name  # Emit event
vant event --listen     # Listen for events
```

## Security Commands

| Command | Description |
|---------|-------------|
| `vant encrypt` | Encryption utilities |
| `vant sudo` | Privilege management |
| `vant security` | Security utilities |

### vant encrypt

Encryption utilities:

```bash
vant encrypt --encrypt file.txt      # Encrypt file
vant encrypt --decrypt file.enc      # Decrypt file
vant encrypt --keygen               # Generate key
```

### vant sudo

Privilege management:

```bash
vant sudo --elevate                 # Elevate privileges
vant sudo --status                  # Check status
vant sudo --revoke                  # Revoke privileges
```

## DevOps Commands

| Command | Description |
|---------|-------------|
| `vant metrics` | Metrics dashboard |
| `vant system` | System diagnostics |
| `vant health` | Health check |
| `vant cron` | Cron scheduler |

### vant metrics

Metrics dashboard:

```bash
vant metrics               # Show metrics
vant metrics --json      # JSON output
vant metrics --reset     # Reset counters
```

### vant system

System diagnostics:

```bash
vant system               # System info
vant system --verbose    # Detailed output
vant system --check      # Run checks
```

### vant health

Health check:

```bash
vant health              # Full check
vant health --quiet     # Minimal output
vant health --json      # JSON output
```

### vant cron

Cron scheduler:

```bash
vant cron                # List jobs
vant cron add "*/5 *" cmd # Add job
vant cron remove id     # Remove job
```

## Agent Commands

| Command | Description |
|---------|-------------|
| `vant agents` | Multi-agent management |
| `vant load` | Load brain |
| `vant onboard` | Browse brain files |
| `vant islands` | Island component boot |
| `vant mcp` | MCP server |
| `vant succession` | Trust levels |

### vant agents

Multi-agent management:

```bash
vant agents               # List agents
vant agents spawn name  # Spawn agent
vant agents kill id    # Kill agent
```

### vant load

Load brain:

```bash
vant load                # Load brain
vant load --path path   # Custom path
vant load --repl       # Interactive mode
```

### vant onboard

Browse brain files:

```bash
vant onboard             # Interactive browser
vant onboard --path     # Browse path
```

### vant islands

Island component boot:

```bash
vant islands             # Show islands
vant islands boot       # Boot islands
vant islands load name  # Load island
```

### vant mcp

MCP server for AI tools:

```bash
vant mcp                 # Start MCP server
vant mcp --port 3457   # Custom port
vant mcp --key secret  # Require API key
```

## Brain Commands

| Command | Description |
|---------|-------------|
| `vant brain` | Brain operations |
| `vant horcrux` | Backup/restore |
| `vant stego` | Stego recovery |
| `vant lock` | Write locking |
| `vant lineage` | Trace/audit |

### vant brain

Brain operations:

```bash
vant brain               # Show brain status
vant brain --stats     # Brain statistics
vant brain --path      # Brain path
```

### vant horcrux

Backup/restore brain to images:

```bash
vant horcrux backup     # Create backup
vant horcrux restore   # Restore backup
vant horcrux list      # List backups
```

### vant stego

Stego brain recovery:

```bash
vant stego              # Scan for stego
vant stego --extract   # Extract data
vant stego --verify    # Verify integrity
```

### vant lock

Brain write lock:

```bash
vant lock acquire      # Acquire lock
vant lock release     # Release lock
vant lock status      # Show lock status
```

### vant lineage

Trace/audit trail:

```bash
vant lineage            # Show lineage
vant lineage --graph   # Graph view
vant lineage --json   # JSON output
```

## Skills & Plugins

| Command | Description |
|---------|-------------|
| `vant skills` | Skill management |
| `vant embed` | Embedding operations |
| `vant theme` | Theme management |

### vant skills

Skill management:

```bash
vant skills             # List skills
vant skills add url   # Add skill
vant skills remove    # Remove skill
```

### vant embed

Embedding/vector operations:

```bash
vant embed             # Show embed status
vant embed --query    # Query vectors
vant embed --index   # Build index
```

### vant theme

Theme management:

```bash
vant theme             # Show theme
vant theme set name   # Set theme
vant theme list      # List themes
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
| `vant qos` | QoS rate limiting |
| `vant sandbox` | Capability sandbox |
| `vant security` | Security utilities |
| `vant vaf` | Input validation |
| `vant habitat` | Runtime environment |
| `vant legal` | Compliance tools |
| `vant consensus` | Consensus mechanisms |
| `vant framework` | Agent framework |
| `vant runop` | Run operator |
| `vant escrow` | Escrow service | |

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

### vant qos

QoS (Quality of Service) rate limiting:

```bash
vant qos                  # Show QoS status
vant qos --stats         # View rate limit stats
vant qos --reset         # Reset counters
```

### vant sandbox

Capability sandbox for security:

```bash
vant sandbox             # Show sandbox status
vant sandbox --allow    # Enable capabilities
vant sandbox --deny    # Restrict capabilities
```

### vant security

Security utilities:

```bash
vant security            # Run security audit
vant security --scan    # Scan for vulnerabilities
vant security --fix     # Auto-fix issues
```

### vant vaf

Validation-Authorization-Framework (input validation):

```bash
vant vaf                 # Show VAF status
vant vaf --validate     # Validate inputs
vant vaf --rules        # List validation rules
```

### vant habitat

Runtime environment management:

```bash
vant habitat             # Show environment info
vant habitat --init     # Initialize environment
vant habitat --status   # Check runtime status
```

### vant legal

Compliance and legal tools:

```bash
vant legal               # Compliance check
vant legal --audit      # Audit compliance
vant legal --report     # Generate report
```

### vant consensus

Consensus mechanisms for multi-agent:

```bash
vant consensus           # Show consensus status
vant consensus --vote   # Submit vote
vant consensus --tally # Tally results
```

### vant framework

Agent framework utilities:

```bash
vant framework           # Framework info
vant framework --list   # List available frameworks
vant framework --init  # Initialize framework
```

### vant runop

Run operator for task execution:

```bash
vant runop               # Show operators
vant runop --execute    # Execute operation
vant runop --status    # Check status
```

### vant escrow

Escrow service for operations:

```bash
vant escrow              # Escrow status
vant escrow --hold      # Hold operation
vant escrow --release  # Release held operation
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
| `vant sync` | GitHub brain sync |
| `vant hybrid-sync` | Public/private brain sync |
| `vant watch` | Poll GitHub for changes |
| `vant config` | Configuration management |
| `vant branch` | Branch management |

### vant sync

GitHub brain sync:

```bash
vant sync               # Full sync
vant sync --push     # Push only
vant sync --pull     # Pull only
```

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