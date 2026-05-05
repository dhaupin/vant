# VANT Roadmap

> VANT = Versatile Autonomous Networked Tool

## Latest Guides

See [docs.creadev.org/vant/guides](/guides/) for detailed guides.

---

## v0.9.0 - Next

### Capabilities
- [ ] Video steganography (larger payloads)
- [ ] Audio steganography
- [ ] WebM/MKV support

### Testing
- [ ] Unit tests for lib/*.js
- [ ] Integration tests

---

## v1.0.0 - Agent Portal

### Dashboard
- [ ] Web UI for brain visualization
- [ ] Session history timeline
- [ ] Memory usage stats
- [ ] Agent activity log

### Portal Server
- [ ] Express/Node server
- [ ] Auth (API key or OAuth)
- [ ] REST API for brain CRUD
- [ ] WebSocket for real-time updates

---

## Released

### v0.8.x Series

#### v0.8.4 - Security Release (2026-05-04)
- [x] 12 security vulnerabilities fixed (V001-V012)
- [x] VAF prompt injection blocking
- [x] Model key validation
- [x] MCP authentication
- [x] GitHub token security
- [x] Lock token security

#### v0.8.3 (2026-04-19)
- [x] MCP Server - Exposes Vant memory as AI tools
- [x] Node Runner - Persistent agent node
- [x] Help Command - Full CLI reference
- [x] AGENTS.md - Agent branching guide
- [x] Full Public Model - 19 brain files

#### v0.8.2 (2026-04-19)
- [x] RGBA Steganography - 4 bits/pixel
- [x] Multi-Image Encoding - Split large messages
- [x] Slack/Discord Notifications
- [x] Telegram Bot

#### v0.8.1 (2026-04-16)
- [x] Docker Multi-Arch - amd64/arm64
- [x] Health Endpoints
- [x] CLI Prompts
- [x] Progress Bars

#### v0.8.0 (2026-04-16)
- [x] Multi-Agent Locking
- [x] Branch Management
- [x] Initial public release
- [x] MIT License

---

## Backlog

### Core
- [ ] Redis-backed distributed locks
- [ ] i18n/localization

### Agent UX
- [ ] Interactive setup wizard
- [ ] TUI (terminal UI)
- [ ] Session replay

### Integrations
- [ ] Matrix/Element support
- [ ] WhatsApp Business API

### Monitoring
- [ ] Grafana dashboards
- [ ] Prometheus metrics
- [ ] Alerting rules
