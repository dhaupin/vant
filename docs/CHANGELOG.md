# CHANGELOG
version: 0.8.6

All notable changes to Vant are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0).

---

## [v0.8.4] - 2026-05-04 - Security Release

### ⚠️ MAJOR SECURITY RELEASE

This version contains comprehensive security hardening from a deep penetration test and security audit session.

### Security (12 Vulnerabilities Fixed)

| ID | Severity | Vector | File | Description |
|----|----------|--------|------|-------------|
| V001 | CRITICAL | Command injection | bin/changelog.js | Unsafe exec with string concatenation |
| V002 | HIGH | Token exposure | bin/sync.js | GitHub token in URL |
| V003 | HIGH | Auth bypass | bin/mcp.js | No MCP authentication |
| V004 | MEDIUM | DoS | lib/lock.js | Lock acquisition flood |
| V005 | MEDIUM | Path traversal | lib/config.js | Model path with ../ |
| V006 | MEDIUM | DoS | lib/succession.js | Unsafe JSON.parse |
| V007 | MEDIUM | DoS | lib/resolution.js | Unsafe JSON.parse |
| V008 | MEDIUM | DoS | lib/update-check.js | Unsafe JSON.parse + dup validation |
| V009 | MEDIUM | DoS | lib/onboard.js | Unsafe JSON.parse |
| V010 | HIGH | Prompt injection | lib/vaf.js | No AI prompt filtering |
| V011 | MEDIUM | Key injection | lib/brain.js | Unsafe key in writes |
| V012 | LOW | Context overflow | lib/auto-update.js | No max limit (existed) |

### AI Security Hardening

- **Prompt Injection**: Added 17+ patterns to VAF blocklist
  - "ignore previous instructions", "forget everything"
  - "new system:", "role:", "act as"
  - "DAN mode", "jailbreak"
  - Template injection: {{system}}, [INST], [SYS]
  
- **Model Key Validation**: Brain file keys validated
  - Only alphanumeric, underscore, hyphen allowed
  - Prevents filename injection
  
- **Context Protection**: Message limits existed
  - 50 message max, 100KB content limit

### Deep Audit Vectors Analyzed

| Vector | Status | Protection |
|--------|--------|------------|
| Command injection | ✅ BLOCKED | VAF + safe spawn |
| Path traversal | ✅ BLOCKED | VAF + path validation |
| Script injection | ✅ BLOCKED | VAF patterns |
| Prompt injection | ✅ BLOCKED | V010 |
| Context poisoning | ✅ LIMITED | V012 |
| Model hijacking | ✅ PROTECTED | V003 (MCP auth) |
| YAML deserialization | ✅ SAFE | js-yaml (no eval) |
| JSON deserialization | ✅ SAFE | V006-V009 |
| System prompt theft | ✅ MITIGATED | No secrets in logs |
| Key injection | ✅ FIXED | V011 |

### Documentation Updated

- docs/guides/security.md - Full vulnerability disclosure
- docs/CHANGELOG.md - This file
- README.md - Security section linked
- docs/guides/manual-brain.md - Manual brain creation guide
- docs/guides/release.md - Release process guide
- All docs now have version frontmatter (0.8.6)
- CLI.md referenced in AGENTS.md
- lib/version.js referenced in AGENTS.md

### Documentation System

- Jekyll docs migrated to /docs/
- All guides have nav_order frontmatter
- Broken links fixed across docs
- Version-aligned all 42 markdown files

### Code Quality

- JSDoc added throughout lib/ and bin/
- Security tests added for all VAF patterns
- MCP authentication implemented
- Password validation for stego.js

### Thanks

Security audit and documentation pass by OpenHands agent.



---

## [v0.8.3] - 2026-04-19

### Fixed
- **bin/run.js** - Updated vant-brain references → Vant
- **README.md** - Removed vant-brain references
- **LIBS.md/CLI.md** - Updated references

---

## [v0.8.2] - 2026-04-19

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

## [v0.8.1] - 2026-04-16

### Added
- **RGBA Steganography** - 4 bits/pixel capacity using alpha channel
  - lib/stego.encodeRGBA(buffer, imageData)
  - lib/stego.decodeRGBA(imageData)
- **Multi-Image Encoding** - Split large messages across multiple PNGs
  - lib/stego.encodeMulti(buffer, imageDatas)
  - lib/stego.decodeMulti(imageDatas)
- **Slack/Discord Notifications** - Webhook integrations
  - lib/notifications.slack(message, options)
  - lib/notifications.discord(message, options)
  - lib/notifications.broadcast(message, targets)
  - lib/notifications.event(eventType, data)
- **Telegram Bot** - Bot wrapper and CLI
  - lib/telegram.js - Bot API wrapper
  - bin/bot.js - Bot CLI (vant bot)
  - Commands: /start, /status, /brain, /health, /sync
- **Docker Multi-Arch** - amd64 and arm64 support
  - Updated Dockerfile with buildx instructions
  - Added docker-compose.yml

### Changed
- Updated dist stats: 14 libs, 6 brain versions, 16 CLI commands
- Added bot to CLI commands

---

## [v0.8.0] - 2026-04-16

### Added
- **Health Endpoints** - HTTP health checks
  - lib/health.js - Health check utilities
  - bin/server.js - Health server (vant server)
- **CLI Prompts** - Interactive prompts
  - lib/prompts.js - Inquirer-based prompts
- **Progress Bars** - CLI progress display
  - Uses cli-progress for sync/load operations
- **Datadog Metrics** - Metrics integration
  - lib/metrics.js - Datadog metrics
- **Stegoframe Support** - Encrypted image transport
  - Encrypt/decrypt with AES-256-GCM

### Changed
- Initial public release
- MIT License

---

## [v0.7.0] - 2026-04-15

### Added
- **Multi-Agent Locking** - Race-condition safety
  - lib/lock.js - File-based locking
- **Branch Management** - Per-session branches
  - lib/branch.js - Git branch utilities

---

## [v0.5.0] - [v0.6.0] - 2026-04-14

### Added
- Core CLI (vant start, sync, health, load, run, test)
- Brain loader (learnings/, memories/, decisions/, todos/)
- Logger, config, errors utilities
- GitHub sync

---

## [Older]

See git history for previous changes.
