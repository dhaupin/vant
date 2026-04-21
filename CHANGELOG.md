# Changelog

> VANT = Versatile Autonomous Networked Tool

All notable changes to VANT are documented here.

---

## v0.8.5 (2026-04-21)

### Docs System
- **Jekyll Migration** - Switch from Docsify to Jekyll
  - docs/ folder restructured for Jekyll rendering
  - New _config.yml, _sidebar.yml, _redirects
  - Permalinks for clean URLs
- **Docs Funnel** - Root MDs now point to docs
  - CLI.md, LIBS.md, CONTENT.md, STEGO.md deprecated
  - All point to docs/ for full reference
  - Backwards compat via deprecated notices
  - Added /style, /steganography redirects

### Documentation
- **AGENTS.md** - Added deep scan knowledge
  - Project overview, architecture diagram
  - Key dependencies, CLI commands table
  - Integration points documented
  - Important patterns (lock before write, branch per agent)

---

### Security: VAF (Vant Application Firewall)
- New lib/vaf.js - Security layer:
  - Input validation, path traversal protection
  - Content filtering (PHP, script injection, shell)
  - Rate limiting, file extension blocking
- Integrated into bin/mcp.js, lib/resolution.js, lib/branch.js

### Added
- **lib/protection.js** - Circuit breaker for MCP
- **lib/load.js** - Model loader utilities
- **Onboarding** - Knowledge base browser
  - vant onboard - View/search brain files
  - lib/onboard.js - Search + read brain
- **Succession** - Brain version/trust management
  - vant succession - Version + trust levels
  - lib/succession.js - Trust level controls
- **Resolution** - Improved frontmatter matching
  - Fix path resolution (PROJECT_ROOT)
  - Auto-add .md extension  
  - Partial match for bullets/headings
  - Returns foundType, foundAt metadata
- **Resolution** - Thought status tracking
  - vant resolution - Mark thoughts resolved/deprecated/rejected
  - lib/resolution.js - Per-file/per-entry status
  - Deltas for change tracking
- **MCP Authentication** - API key for secure AI tool access
  - X-API-Key header for all MCP endpoints
  - Via VANT_MCP_API_KEY env or MCP_API_KEY in config.ini
  - Optional but recommended for production
- **Full CLI Help** - All 20 commands documented
  - vant help <cmd> now delegates properly to help.js
  - mcp --help shows full docs with curl examples
- **onboard Command** - Onboarding summary
- **succession Command** - Brain succession status

### Changed
- Updated CLI.md with MCP auth section
- MCP server now blocks without correct key when configured
- POST /call endpoint fixed (JSON-RPC params handling)
- Removed .agents_tmp directory
- Removed deploy.example.sh (CI/CD handles deploys)

### Fixed
- vant help <cmd> now shows specific command help
- bin/mcp.js --help exits properly (doesn't start server)
- Node --help now shows help (was starting node instead)
- onboard read <file> now auto-adds .md extension

---

## v0.8.3 (2026-04-19)

### Fixed
- **bin/run.js** - Updated vant-brain references → Vant
- **README.md** - Removed vant-brain references
- **LIBS.md/CLI.md** - Updated references

---

## v0.8.2 (2026-04-19)

### Added
- **MCP Server** - Exposes Vant memory as AI tools
  - bin/mcp.js - JSON-RPC over HTTP/stdio
  - Tools: vant_get_memory, vant_set_memory, vant_branch, vant_lock, etc
- **Node Runner** - Runs Vant as persistent node
  - bin/node.js - Polls GitHub, optional MCP server
  - Like crypto nodes: same software, own brain state
- **Help Command** - Full CLI reference
  - bin/help.js - Shows all commands with examples
  - vant help [command] for specific help
- **AGENTS.md** - Agent branching guide
  - How to use branches + locks for multi-agent
- **Full Public Model** - Complete brain with 19 files
  - identity.md, ego.md, fears.md, anger.md, joy.md - Core
  - manifesto.md, creed.md, goals.md, preferences.md - Values
  - lessons.md - Historical learnings
  - qc.md, security.md, audit.md, errors.md - Operations
  - keepers.md, curiosity.md, humility.md, empathy.md, gratitude.md - Humanity
- **Multi-handler Verbosity** - Split verbosity.ini into handlers
  - response, content, comment, code, log modes
- **CONTENT.md** - Voice, tone, and style guide
  - No clichés, short dashes, specific over abstract
- **SEO dist/index.html** - Optimized for discoverability

### Changed
- Converted .txt to .md (identity.txt → identity.md, etc.)
- Backward compatibility: code works with both .md and .txt
- Updated schema/memory-files.md and transport-protocol.txt
- Fixed lib paths in build-test.js

### Fixed
- lib/verbosity.js now loads from verbosity.ini
- load.js loads both .md and .txt extensions
- health.js checks for both extensions

---

## v0.8.1 (2026-04-16)

### Added
- **RGBA Steganography** - 4 bits/pixel capacity using alpha channel
  - `lib/stego.encodeRGBA(buffer, imageData)`
  - `lib/stego.decodeRGBA(imageData)`
- **Multi-Image Encoding** - Split large messages across multiple PNGs
  - `lib/stego.encodeMulti(buffer, imageDatas)`
  - `lib/stego.decodeMulti(imageDatas)`
- **Slack/Discord Notifications** - Webhook integrations
  - `lib/notifications.slack(message, options)`
  - `lib/notifications.discord(message, options)`
  - `lib/notifications.broadcast(message, targets)`
  - `lib/notifications.event(eventType, data)`
- **Telegram Bot** - Bot wrapper and CLI
  - `lib/telegram.js` - Bot API wrapper
  - `bin/bot.js` - Bot CLI (`vant bot`)
  - Commands: /start, /status, /brain, /health, /sync
- **Docker Multi-Arch** - amd64 and arm64 support
  - Updated Dockerfile with buildx instructions
  - Added docker-compose.yml

### Changed
- Updated dist stats: 14 libs, 6 brain versions, 16 CLI commands
- Added `bot` to CLI commands

---

## v0.8.0 (2026-04-16)

### Added
- **Health Endpoints** - HTTP health checks
  - `lib/health.js` - Health check utilities
  - `bin/server.js` - Health server (`vant server`)
- **CLI Prompts** - Interactive prompts
  - `lib/prompts.js` - Inquirer-based prompts
- **Progress Bars** - CLI progress display
  - Uses `cli-progress` for sync/load operations
- **Datadog Metrics** - Metrics integration
  - `lib/metrics.js` - Datadog metrics
- **Stegoframe Support** - Encrypted image transport
  - Encrypt/decrypt with AES-256-GCM

### Changed
- Initial public release
- MIT License

---

## v0.7.0 (2026-04-15)

### Added
- **Multi-Agent Locking** - Race-condition safety
  - `lib/lock.js` - File-based locking
- **Branch Management** - Per-session branches
  - `lib/branch.js` - Git branch utilities

---

## v0.5.0 - v0.6.0 (2026-04-14)

### Added
- Core CLI (vant start, sync, health, load, run, test)
- Brain loader (learnings/, memories/, decisions/, todos/)
- Logger, config, errors utilities
- GitHub sync

---

### Future (Unreleased)

- Unit tests for lib/*.js
- Redis-backed distributed locks
- i18n/localization
- Web dashboard