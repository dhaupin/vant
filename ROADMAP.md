# VANT Roadmap

> VANT = Versatile Autonomous Networked Tool

## v0.9.0 - Next

### Capabilities
- [ ] Video steganography (larger payloads)
- [ ] Audio steganography 
- [ ] WebM/MKV support

### Testing
- [ ] Unit tests for lib/*.js
- [ ] Integration tests
- [ ] Bot testing (Slack/Discord/Telegram)

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

## Backlog

### Core
- [ ] Redis-backed distributed locks
- [ ] Docker multi-arch push automation
- [ ] i18n/localization

### Agent UX
- [ ] Interactive setup wizard
- [ ] TUI (terminal UI)
- [ ] Session replay

### Integrations
- [ ] Test Slack notifications
- [ ] Test Discord bot
- [ ] Test Telegram bot
- [ ] Matrix/Element support
- [ ] WhatsApp Business API

### Monitoring
- [ ] Grafana dashboards
- [ ] Prometheus metrics
- [ ] Alerting rules

---

## Released (v0.8.1)

- [x] RGBA steganography (4 bits/pixel)
- [x] Multi-image encoding
- [x] Slack/Discord webhooks
- [x] Telegram bot
- [x] Docker multi-arch (amd64/arm64)
- [x] Health endpoints
- [x] CLI prompts
- [x] Multi-agent locking