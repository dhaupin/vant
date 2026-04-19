# Changelog

> VANT = Versatile Autonomous Networked Tool

All notable changes to VANT are documented here.

---

## v0.8.2 (2026-04-19)

### Added
- **Full Public Model** - All memory files in models/public/
  - identity.md, ego.md, fears.md, anger.md, joy.md
  - manifesto.md, creed.md, goals.md, preferences.md, lessons.md
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