# Vant Roadmap

## v0.9.0 - Stegoframe Upgrades

### Encryption [DONE]
- [x] Add AES-256 encryption before encoding
- [x] Support password-protected messages
- [x] Encrypt then encode pipeline

### Capacity
- [ ] Split large payloads across multiple PNGs
- [ ] Reassemble on decode
- [ ] Use RGBA channels (4 bits per pixel instead of 3)

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

### Agent Interface
- [ ] `/portal/status` - current brain health
- [ ] `/portal/sessions` - list past sessions
- [ ] `/portal/transfer` - request memory transfer

---

## Backlog

### Core
- [ ] Unit tests for all lib/*.js modules
- [ ] CI/CD pipeline verification
- [ ] Docker multi-arch builds (arm64)

### Agent UX
- [ ] Interactive CLI prompts (Inquirer)
- [ ] Colored output throughout
- [ ] Progress bars for long operations

### Integrations
- [ ] Slack webhook notifications
- [ ] Discord bot commands
- [ ] Telegram integration

### Monitoring
- [ ] Datadog/StatsD metrics
- [ ] Health check endpoint
- [ ] Alerting on failures

---

## Notes

- Public vs Private split: vant (public) / vant-brain (private)
- See vant-brain for full roadmap with private features