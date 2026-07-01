# VANT Roadmap

> VANT = Versatile Autonomous Networked Tool

## Latest Guides

See [docs.creadev.org/vant/essential](/guides/) for detailed guides.

---

## v0.8.6 - Headless (SCOPE)

> Cloudflare headless mode for agent canvas. MCP→API unified abstraction.

### Phase 1: API System ✅ EXISTS
- [x] lib/api.js - Unified CLI/MCP/headless interface
- [x] lib/mcp.js - JSON-RPC server (158 tools!)
- [x] lib/vant.js - Main runtime, lazy-loads mcp
- [x] Mode detection (cli/mcp/headless)
- [x] vant.startFull() - starts MCP server
- [x] vant.mcp.execute() / listTools()
- [ ] MCP↔VANT tool parity (vant.executeTool routes to MCP tools)

#### Already Built (Cross-Context)
| What | Where | Status |
|------|-------|--------|
| MCP server start/stop | vant.startFull(), vant.shutdown() | ✅ |
| vant.mcp lazy-load | vant.js line 934-939 | ✅ |
| executeTool() | vant.js line 873-889 | ✅ (6 tools) |
| MCP→vant wiring | mcp.js uses brain, agents directly | ✅ |

#### Gap: Tool Parity
- vant.executeTool() handles 6 tools (think, learn, remember, act, search, brain)
- MCP has 158 tools (brain_load, agents_spawn, config_get, etc)
- **Not bridged**: vant.executeTool() doesn't route to mcp.execute()

> Original intent: VANT gates all endpoints as OS functions
> - vant.execute(tool, args) should wrap ALL operations
> - Security chain: VAF → Sandbox → QoS → Auth → Escrow

### Phase 2: Cloudflare Integration
- [ ] CF Functions folder location (functions/ or functions/dist?)
- [ ] lib/connectors/cloudflare.js integration
- [ ] KV/R2/Workers adapters
- [ ] Headless mode for CF Pages

> CF Functions can be anywhere in project (Cloudflare flexibility)

### Phase 3: Admin UI
- [ ] MCP tool exposure for brain CRUD
- [ ] Geometry storage tools (barcodes)
- [ ] Canvas/sharing tools
- [ ] System dashboard endpoints

---

## v0.9.0 - Futures

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

#### v0.8.5 - Cloudflare (2026-06-30)
- [x] Cloudflare connector (KV, R2, Workers)
- [x] R2 JSON API (S3-compatible)
- [x] Worker URL support

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
