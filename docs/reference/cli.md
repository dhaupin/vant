---
version: 0.8.6
permalink: /reference/cli
layout: default
title: CLI Reference
nav_order: 111
---

# CLI Reference

Every user-facing `vant` command. Signatures were verified against the
command implementations in `bin/` for this release. Every command also
accepts `-h` or `--help` unless noted otherwise.

Core commands live in `bin/vant.js`. Everything else is `bin/<command>.js`,
dispatched by the main entrypoint.

## Start here

| Command | Description |
|---------|-------------|
| `vant setup` | Interactive first-run wizard |
| `vant start` | Full startup (migrate, health, sync, load, run) |
| `vant health` | System diagnostics |
| `vant help` | Show all commands and global flags |
| `vant version` | Show version (`-v`, `--version`) |

```bash
vant setup
vant start              # Full startup; auto-migrates legacy brain layouts
vant start --no-sync    # Skip GitHub sync
vant start --local      # Skip GitHub entirely
vant start --no-migrate # Skip brain layout migration
vant health
```

## Sync and brain

| Command | Description |
|---------|-------------|
| `vant sync` | Pull/push brain from/to GitHub |
| `vant hybrid` | Public/private brain split sync (runs hybrid-sync) |
| `vant watch` | Poll GitHub for changes |
| `vant repos` | Mount and sync external repositories |
| `vant load` | Load brain files (.md, .json, .yaml, .ini, .txt) |
| `vant onboard` | Browse brain files interactively |
| `vant migrate` | Brain layout migration (multi-brain import) |
| `vant lock` | Brain write lock for multi-agent safety |
| `vant lineage` | Trace/audit trail for brain changes |
| `vant prune` | Prune old or stale brain files |

```bash
vant sync               # Pull, then push
vant sync push          # Push only
vant sync pull          # Pull only

vant hybrid --public    # Push public brain only
vant hybrid --private   # Push private brain only

vant load               # Load brain from models/private
vant load --version 3   # Load a specific brain version
vant load --latest      # Force latest

vant onboard --list     # List brain files

vant migrate --status   # Layout version and pending migrations
vant migrate --dry-run  # Preview what would move, no changes
vant migrate            # Apply pending migrations
vant migrate --brain-name mybrain  # Name the imported brain (default: vant)

vant lock acquire
vant lock release
vant lock status
```

`vant migrate` notes:

- `vant start` runs migration automatically before health; `--no-migrate` skips it.
- Detection is content-based, so it is safe to run at any time.
- Every step is idempotent; a second run is a no-op.
- A failed import is retryable: the marker is withheld and the next run retries.
- Existing brain files are never clobbered; existing files are skipped.
- `vant health` warns on legacy (pre-multi-brain) trees until migrated.

`vant watch` polls GitHub on an interval:

```bash
vant watch                # Poll GitHub for changes
vant watch --interval 30  # Poll every 30 seconds
```

## Memory and search

The unified memory surface: key-value state, documents, geometric
addressing. See [Memory](/vant/memory/brain) and [Brain Search](/vant/memory/search).

| Command | Description |
|---------|-------------|
| `vant memory` | Full memory CLI (state, learn, query, address, locate) |
| `vant learn` | Shortcut: store a document |
| `vant remember` | Shortcut: store/recall state |
| `vant address` | Shortcut: store at an NSC9 geometric address |
| `vant locate` | Shortcut: retrieve by NSC9 barcode |
| `vant search` | Search the brain corpus (basic, rag, hybrid, hyde) |
| `vant rerank` | Rerank and compress results for LLM context |
| `vant embed` | Embedding provider management |
| `vant citations` | Citation management |
| `vant geometry` | NSC9 quasicrystal storage (barcode addressing) |

```bash
vant memory state <key> <value>    # Store state (TTL cache)
vant memory recall <key>           # Get state
vant memory learn <key> <content>  # Learn document (persists)
vant memory query <key>            # Query document
vant memory address <data>         # Store at geometric address
vant memory locate <barcode>       # Locate by barcode
vant memory list                   # Show stats
vant memory clear                  # Clear all

vant learn goals "Ship the T2 sweep." --ttl 60000
vant remember goals --ttl 3600000     # Recall with TTL

vant search <query>                # Default: hybrid
vant search <query> --mode basic   # Text search
vant search <query> --mode rag     # Semantic LTC
vant search --hyde <query>         # HyDE transform
vant search <query> -r             # Rerank results
vant search --stats                # Index stats

vant rerank <query>                # Rerank for context
vant rerank compress <file>        # Compress a results file

vant embed list                    # Providers: hash, local, openai
vant embed set openai              # Set provider
vant embed info                    # Show provider info
vant embed generate "text"         # Generate an embedding
vant embed batch "one" "two"       # Batch embeddings

vant citations list
vant citations add <ref>
vant citations verify <ref>
vant citations search <query>

vant geometry store <key> <val>    # Store in quasicrystal
vant geometry retrieve <key>       # Retrieve by key
vant geometry address <data>       # Store at random barcode
vant geometry locate <barcode>     # Retrieve by barcode
```

`--ttl` auto-expires state entries and returns `{ ttl, expiresAt }`.

## Agents and runtime

| Command | Description |
|---------|-------------|
| `vant run` | Long-running agent loop |
| `vant node` | Persistent node (continuous run with brain loaded) |
| `vant agents` | Multi-agent management |
| `vant islands` | Island component boot |
| `vant mcp` | MCP server for AI tools |
| `vant api` | API utilities (status, routes, call) |
| `vant org` | Operator scope/capability grant for this process |
| `vant trust` | Reputation and trust scores |
| `vant resolution` | Thought resolution tracking |
| `vant succession` | Trust level management |
| `vant vibe` | Show/set runtime mood |
| `vant snapshot` | Verifiable stego-SVG brain snapshot |
| `vant brain-unlock` | Restore a brain from an SVG horcrux |
| `vant error` | Error code lookup and stats |
| `vant compute` | Multi-language compute runner |

```bash
vant run                    # Interactive loop
vant run -p "task"          # Run one task and exit
vant run --mcp              # MCP mode

vant node --mcp             # Node plus MCP server
vant node --mcp-port 4000   # Custom MCP port

vant agents list
vant agents spawn <name>
vant agents kill <id>

vant islands                # Show islands
vant islands boot           # Boot islands
vant islands load <name>    # Load an island

vant mcp --stdio            # STDIO mode
vant mcp --server --port 3457

vant org grant                                  # Grant operator scopes
vant org grant --scopes read,write,spawn
vant org status
vant org config --set-operator-scopes read,write,spawn   # Persist in brain config
vant org demo                                   # Run the demo org flow

vant trust score <entity>
vant trust record <entity> <type> <delta>
vant trust leaderboard

vant resolution status
vant resolution resolve          # Mark resolved
vant resolution reject           # Mark rejected

vant succession                  # Show current trust level
vant succession get
vant succession set <level>

vant vibe                        # Show current vibe
vant vibe experimental           # or safety_first

vant snapshot                    # Default output: <brain>/boot/<agent>-p_<pw>.svg
vant snapshot --agent nova       # Snapshot under a specific agent name
vant snapshot --brain nova       # Snapshot into a specific brain's boot dir
vant snapshot --password <pw>    # Explicit password
vant snapshot --output <path>    # Custom output path (inside the repo)
vant snapshot --no-verify        # Skip the round-trip verification
                                 # (REFUSED when overwriting an existing
                                 #  horcrux — see below)

# Backup safety: if the target already exists (i.e. it IS some brain's live
# boot horcrux), snapshot writes to a sibling tmp file, round-trip validates
# it, and only then replaces the original — same contract as
# `vant horcrux refresh`. A failed or corrupt encode never destroys the only
# backup. Brand-new targets write directly. The default output follows the
# current brain (models/public/<brain>/boot/<agent>-p_<pw>.svg), not a
# hardcoded brain name.

# Note: snapshot self-grants write on a fresh default sandbox (the CLI is
# trusted); a host that has explicitly locked the sandbox down must grant
# canWrite first. Sidecars (.manifest.json, .sha256) are gitignored. All
# paths resolve against the repo root regardless of invocation cwd.

vant error list
vant error code <code>
vant error explain <code>
```

`vant node` does not poll GitHub by default. Background sync is opt-in:
`--enable-polling`, `VANT_AGREE_AUTO_SYNC=true`, or typing AGREE when
prompted. It is intended for self-hosted GitLab/Gitea; on GitHub.com use
`vant sync`.

MCP auth is optional and configured through `vant config`:

```bash
vant config set mcp.requireKey true
vant config set mcp.apiKey "your-secret-key"   # or: export VANT_MCP_API_KEY=...
```

Clients authenticate with `X-API-Key: <key>` or
`Authorization: Bearer <key>`.

## Storage

| Command | Description |
|---------|-------------|
| `vant storage` | Storage status and stats |
| `vant cache` | Cache management |
| `vant tmp` | Temp file management |
| `vant stream` | Stream operations |
| `vant wal` | Write-ahead journal status and recovery |
| `vant mirror` | Storage replication |
| `vant s3` | S3-compatible remote storage (S3, R2, MinIO, B2) |
| `vant backup` | Brain backup and restore |
| `vant horcrux` | Backup/restore brain to images |
| `vant transform` | Data gather and horcrux packaging |
| `vant compress` | Entropy encoder for brain files (.vpatch) |
| `vant stego` | Steganography encode/decode for images |
| `vant brain` | Brain mode control (dual/public/private/remote) |
| `vant format` | Format detection and conversion |
| `vant schema` | JSON/YAML schema validation |

```bash
vant storage                # Show storage status
vant cache --clear          # Clear cache
vant tmp list               # List temp files (workspace space)
vant tmp create "text"      # Create a temp file
vant tmp clean              # Clear the workspace temp space
vant tmp stats              # File count + task context

vant wal --status <basePath>  # Journal state (records, pending intents)
vant wal --drill <basePath>   # Reopen, replay, verify, report
vant wal --reset <basePath>   # Drop the journal (verify first)

vant mirror --status        # Replication config and stats
vant mirror --status --base <path> --mirror <path>...

vant s3 --status            # Config summary (no secrets printed)
vant s3 test                # Connectivity probe
vant s3 ls [prefix]         # List remote keys
vant s3 push [--dry-run]    # Push local brain to remote
vant s3 pull [--dry-run]    # Pull remote brain to local

vant backup create
vant backup restore <file>   # validates the file first — wrong password /
                             # corrupt file fails before anything is restored
vant backup list
vant backup schedule         # not implemented — prints a cron recipe

vant horcrux inspect [path] [password]
vant horcrux restore [path] [password]
vant horcrux create [path] [password]
vant horcrux refresh [password]      # regenerate boot horcrux in place

vant transform gather
vant transform to-horcrux
vant transform inspect-horcrux <file>

vant compress <file_or_folder>         # Create .vpatch
vant compress <file> --output <dir>
vant compress <file> --window 16 --threshold 0.9
vant compress <file> --stats           # Entropy stats only
vant compress models/latent/x.vpatch --decompress

vant stego encode <input.txt> <image.png>   # Encode text in image
vant stego decode <stego.png>               # Decode from image

vant brain mode dual            # dual | public | private | remote
```

## Network and messaging

| Command | Description |
|---------|-------------|
| `vant server` | HTTP/HTTPS server with security chain |
| `vant network` | Peer network operations |
| `vant nodes` | Peer discovery |
| `vant remote` | Remote add/remove/list |
| `vant msg` | Messaging system |
| `vant event` | Event handling |
| `vant telegram` | Telegram bot |

```bash
vant server --port 8080                  # Custom port
vant server --host 0.0.0.0               # Bind host
vant server --cert <path> --key <path>   # HTTPS

vant msg send <user> <msg>
vant msg --read

vant event --emit <name>
vant event --listen

vant telegram
```

## Security

| Command | Description |
|---------|-------------|
| `vant sandbox` | Capability sandbox status |
| `vant vaf` | Input validation checks |
| `vant sudo` | Privilege elevation and metrics |
| `vant secret` | Secret management |
| `vant encrypt` | Encryption utilities |
| `vant rls` | Row-level security context |
| `vant security` | Security utilities |
| `vant legal` | Compliance tools |
| `vant escrow` | Escrow service for operations |
| `vant audit` | Generate an audit report |

```bash
vant sandbox status
vant sandbox allow <capability>
vant sandbox deny <capability>

vant secret list              # List secret types
vant secret get <type>        # Get a secret (brain, github, ...)
vant secret set <type> <val>
vant secret clear <type>
vant secret clear --all

vant encrypt --encrypt file.txt
vant encrypt --decrypt file.enc
vant encrypt --keygen

vant rls init
vant rls workspace <name>

vant sudo --elevate
vant sudo --status
vant sudo --revoke
vant sudo metrics

vant audit --json
vant audit --out AUDIT.md      # --out FILE or --out=FILE; inside the repo
```

## Operations

| Command | Description |
|---------|-------------|
| `vant metrics` | Metrics registry dashboard |
| `vant cron` | Cron job scheduler |
| `vant clean` | Unified cleanup (logs, tmp, cache, prune) |
| `vant config` | Configuration get/set/list |
| `vant validate` | Schema, audit, and circuit validation |
| `vant auth` | Authentication management |
| `vant update` | Check for new releases |
| `vant bump` | Bump version and tag a release |
| `vant rate` | Rate limiter status and reset |
| `vant docs` | Build docs for release |
| `vant docs-build` | Docs build with version stamping |
| `vant summary` | Session summary |
| `vant changelog` | View recent changes |
| `vant system` | System diagnostics and layer status |
| `vant shell` | Shell operations |
| `vant boot` | Ghost boot from a stego image |

```bash
vant metrics                    # Registry summary
vant metrics --prom             # Prometheus exposition format
vant metrics storage            # Per-store aggregation

vant cron list
vant cron add <spec> <cmd>
vant cron remove <id>
vant cron run <id>
vant cron status

vant clean --dry-run            # Preview without changes
vant clean logs                 # Clean logs only
vant clean tmp
vant clean cache
vant clean prune
vant clean all

vant config get <key>
vant config set <key> <value>
vant config list

vant validate --check           # Full validation

vant auth login <user>
vant auth logout

vant bump patch --yes           # Explicit type plus --yes is required
vant bump minor --yes
vant bump major --yes

vant rate                       # Rate limiter status
vant rate reset <clientId>

vant docs build                 # Build docs for release
vant docs serve                 # Serve locally (docsify)
vant docs-build

vant summary
vant changelog                  # Recent commits (default: 20)
vant changelog --since v0.7.0
vant changelog --format=short

vant system status
vant system healthy
```

## Ecosystem

Experimental social, governance, and meta surfaces. Each is a real module
with its own `--help`.

| Command | Description |
|---------|-------------|
| `vant teams` | Organization and team management |
| `vant governance` | Governance decision making |
| `vant market` | Knowledge trading (list, bid) |
| `vant encounter` | Agent encounter tracking |
| `vant forum` | Forum and discussion |
| `vant context` | Prompt caching and context engine |
| `vant consciousness` | Consciousness engine |
| `vant spirit` | Spirit system |
| `vant relay` | Relay operations |
| `vant recursion` | Recursion engine |
| `vant registry` | General registry |
| `vant webhooks` | Webhook management |
| `vant webhook` | Alias of `vant webhooks` |
| `vant zen` | Zen utilities |
| `vant brain-registry` | Brain registration |
| `vant node-registry` | Node registration |
| `vant habitat` | Runtime environment |
| `vant consensus` | Consensus mechanisms |
| `vant framework` | Agent framework |
| `vant runop` | Run operator |
| `vant skills` | Skill management |
| `vant theme` | Theme management |
| `vant branch` | Branch management (runs branch-manager) |
| `vant canvas` | Brain data visualization |

```bash
vant teams                # Organization and team management
vant governance           # Governance decisions
vant skills list
vant skills search <q>
vant skills add <url>
vant skills remove <name>

vant theme list
vant theme apply <name>
vant theme create <name>
vant theme preview <name>

vant canvas spiral [count]
vant canvas svg [name]
vant canvas markdown [name]
vant canvas share [name]
```

## Internal

These commands support development and CI. Most users will not need them.

| Command | Description |
|---------|-------------|
| `vant test` | Test runner (`smoke`, `core`, `full` modes) |
| `vant spawn` | Agent spawning utility |

```bash
vant test          # Smoke tests (default)
vant test core     # Brain, storage, core modules
vant test full     # All tests (500+)

test-all           # 17 self-checks across health/search/islands/lib exports
test-all           # (cwd-independent: runs from any directory)

vant spawn list    # List spawned agents
vant spawn --help  # Agent spawner usage
vant build-test    # Build verification (cwd-independent)
vant format-test   # format.js test suite (cwd-independent)
```

Some dev tools are invoked with node directly rather than through the
`vant` dispatcher:

```bash
node bin/sweep.sh        # Test health gate (or: node bin/sweep.sh --quick)
node test/runner.js      # Raw test runner
```

## See also

- [Configuration](/vant/reference/config) for `vant config` keys and `.env` values
- [Entropy Patching](/vant/reference/entropy) for how `vant compress` thresholds work
- [MCP Tools](/vant/reference/mcp-tools) for the tool surface `vant mcp` exposes
- `vant help` always reflects the installed version
