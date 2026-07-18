# VANT Roadmap

> VANT = Versatile Autonomous Networked Tool

## Latest Guides

See [docs.creadev.org/vant/essential](/guides/) for detailed guides.

---

## v0.8.6 - Headless (SCOPE)

> Cloudflare headless mode for agent canvas. MCP→API unified abstraction.

### Phase 1: API System ✅ EXISTS
- [x] lib/api.js - Unified CLI/MCP/headless interface (HAS AUTH)
- [x] lib/mcp.js - JSON-RPC server (158 tools!) - NOW HAS AUTH
- [x] lib/vant.js - Main runtime, lazy-loads mcp
- [x] Mode detection (cli/mcp/headless)
- [x] vant.startFull() - starts MCP server
- [x] vant.mcp.execute() / listTools()
- [x] MCP↔VANT tool parity (vant.executeTool routes to MCP)
- [x] Add auth to MCP server (config.mcpRequireKey gates access)

#### Already Built (Cross-Context)
| What | Where | Status |
|------|-------|--------|
| MCP server start/stop | vant.startFull(), vant.shutdown() | ✅ |
| vant.mcp lazy-load | vant.js | ✅ |
| executeTool() | vant.js - routes to MCP | ✅ (158+ tools) |
| MCP→vant wiring | mcp.js uses brain, agents | ✅ |
| lib/auth.js | Full Auth class | ✅ |
| api.js auth | authenticate() with lockout | ✅ |
| mcp.js auth | config.mcpRequireKey gates | ✅ DONE |
| vant.authenticate() | Common auth handler | ✅ |

#### ✅ DONE: Tool Parity
- vant.executeTool() now routes to MCP for 158+ tools
- Falls back to MCP execute() if not in built-in (6)

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

### _dna.js - Immutable Seed (AIRGAP SUPPORT)

> "The seed doesn't contain the forest - but it contains the instructions to grow one."

The `_dna.js` is the biological DNA of Vant - an immutable, hardcoded seed that:
- Always loads before brain
- Provides fallback if models missing
- Enables airgapped operation
- Version-locked for compatibility

#### Concept
```
_separator_
| Component      | Purpose                    |
|----------------|---------------------------|
| _dna.js        | Seed - minimal bootstrap  |
| models/private | Soil - brain grows here   |
| models/public  | Forest - agent defs        |
| Runtime        | Water/Sun/Air - env       |
```

#### What _dna.js Contains
```js
{
  VERSION: "0.8.6",           // Version lock
  DEFAULT_IDENTITY: {...},    // If no brain
  DEFAULT_MODE: {...},         // Config fallback
  BOOTSTRAP: {...},           // Layer order
  FALLBACK_BRAINS: {...}      // If models missing
}
```

#### Boot Integration
```
boot.js:
1. Load _dna.js (seed - ALWAYS)
2. Load brain.js
3. Brain uses _dna as fallback if model missing
```

#### Why This Matters
- **Airgap**: Works with ONLY _dna.js - no network needed
- **Resilience**: If repo dies, still works
- **P2P**: Agents can share corpus with each other
- **Version Lock**: Prevents drift between horcrux and system

#### Tasks
- [ ] Create `/lib/_dna.js` with essential defaults
- [ ] Integrate into boot.js (load before brain)
- [ ] Add fallback to brain.js if models missing
- [ ] Add version checking on horcrux restore
- [ ] Document airgap behavior
- [ ] Test: boot with no models/
- [ ] Test: horcrux restore on airgapped system

---

### nature.js - Hit-and-Miss Spark Mechanism
- From mycelium (personal brain): hit-and-miss engine pattern
- Self-regulating: only fires when flywheel momentum drops to threshold
- Organic rhythm: pulses when needed, not constant
- Flywheel: keeps momentum between cycles
- "Nature doesn't rush. But everything gets done."

### Capabilities
- [ ] Video steganography (larger payloads)
- [ ] Audio steganography
- [ ] WebM/MKV support

### Testing
- [ ] Unit tests for lib/*.js
- [ ] Integration tests

### Vercel Integration
- [ ] Create `/srv/vercel/` folder structure
- [ ] API routes for sync, kv
- [ ] Connect to Vant connector

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
