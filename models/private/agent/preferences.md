# MYCELIUM CLI TOOLS (bin/)

## Main Entry
- vant.js - Main CLI hub, dispatches to subcommands

## Core Commands
- start.js - Full startup (health → sync → load → run)
- sync.js - Pull/push brain from/to GitHub
- load.js - Load brain from models/public
- run.js - Runtime entry (shows help)
- health.js - System diagnostics

## Brain Management
- branch.js - Branch checkout/create/merge
- lock.js - Acquire/release brain lock
- succession.js - Trust level management

## Development
- build-test.js - Run tests
- build.sh - Build script
- changelog.js - Generate changelog
- bump.js - Version bump + tag
- docs.js - Build docs

## Monitoring
- watch.js - Poll GitHub for changes
- rate.js - Show GitHub API rate limit
- summary.js - Session summary

## MCP Server (AI Tools!)
- mcp.js - Exposes brain as MCP tools
  - vant_get_memory
  - vant_set_memory  
  - vant_list_branches
  - vant_create_branch
  - vant_commit
  - vant_sync
  - vant_lock
  - vant_health

## Usage
  vant start      # Full startup
  vant sync       # GitHub sync
  vant health    # Check health
  vant load      # Load brain
  vant run       # Runtime
  vant mcp      # MCP server
