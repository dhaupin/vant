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

### Phase 2: Cloudflare Integration ✅ IN PROGRESS
- [x] CF Functions folder: `/srv/cloudflare/` (self-contained)
- [x] sync.js - Brain sync endpoint (handshake, push, pull)
- [x] kv.js - Direct KV operations
- [x] index.js - Root handler & health check
- [x] wrangler.toml - CF config
- [x] Cloudflare config in lib/config.js (cfPagesUrl, cfAccountId, etc.)
- [x] Connector uses config module (lib/connectors/cloudflare.js)
- [ ] Deploy /srv/cloudflare/ to CF Pages
- [ ] Set CF_PAGES_URL in config
- [ ] Test end-to-end sync

> Structure: `/srv/[platform]/` for serverless functions

### Phase 3: Admin UI (v0.9.0)
- [ ] Select UI framework: **shadcn/ui** (React + Tailwind + Radix)
- [ ] No-DB Auth: Use existing `Encrypt.signToken()` + brain-stored profiles
- [ ] Admin views:
  - Brain Explorer - navigate/edit brain files
  - Islands Manager - enable/disable/trigger islands
  - Agent Timeline - see agent activity
  - Sync Status - monitor cross-device sync
- [ ] Connect to MCP server (158+ tools)
- [ ] Deploy (Vercel or CF Pages)

> **shadcn/ui Analysis**
> - Copy/paste components (you own the code)
> - Built on Radix UI + Tailwind CSS
> - Works with Vite, Next.js, Remix
> - Pros: Full control, lightweight, accessible, no lock-in
> - Cons: Manual updates, Tailwind required, basic primitives only
> - Security: You own code, no external APIs, Radix handles ARIA
> - Hurdles: Need to wire MCP data layer yourself, no native state management
>
> **Custom Components Analysis (Alternative)**
> - Build own components with Tailwind + Radix primitives directly
> - Pros: Full control, no fighting framework, brain-native components
> - Cons: More upfront work, need to handle ARIA/accessibility yourself
> - Reality: Styling buttons/tables isn't hard; brain viz is custom anyway
> - We can create: `<BrainGraph>`, `<IslandCard>`, `<AgentTimeline>`, `<SyncStatus>`

> **Admin UI Location**
> - Place in `/admin/` (TBD - don't create yet)
>
> **Brain 3D Visualization (Geometry Module)**
> - Use lib/geometry/ for NSC9 barcode-based addressing
> - Icosahedral coordinate system (20 faces, 30 edges, 12 vertices)
> - Penrose P3 tilings (infinite aperiodic surface)
> - Self-authenticating: position computed from barcode, no lookup table
> - Visualize brain as navigable 3D space!
>
> **Duality Module**
> - Bridges brain files ↔ geometry storage
> - `duality.remember(category, key, content)` → stores with NSC9 barcode
> - `duality.recall(brainPath)` → retrieves from geometry or brain
> - Auto-learn from agent events
>
> **Enterprise Use Case**
> - NSC9 barcodes for inventory/tracking
> - Factory routing: QC → Router → Materials
> - Traceable, searchable, visualizable
> - Giant brain = giant searchable space
>
> **Canvas Module (Creative Output)**
> - Paint geometry to shareable art
> - Built-in palettes: ocean, sunset, forest, neon, mono, gold
> - Integrates: geometry + theme + sync + consensus
>
> **Enterprise Features**
> - webhooks.js: Inbound webhook receiver + triggers
> - lineage.js: Object ancestry tracking
> - consensus.js: Agent voting (51% = truth, no blockchain!)
> - resolution.js: Track deprecated/resolved/rejected thoughts
>
> **Connectors (already built)**
> - GitHub, GitLab, Bitbucket, Gitea, Cloudflare
> - Python, Julia, Rust, Go, Ruby, PHP, Node (compute.js)
>
> **System Features**
> - system.js: Status dashboard (all services)
> - compute.js: Polyglot FFI (call Python, Julia, Rust, etc.)
> - skills.js: Skill routing (mirrors islands pattern)
>
> **Admin Bridge Architecture**
> - Frontend: Vite + React (runs on CF Pages)
> - Bridge: **Thin HTTP wrapper** (CF Pages Functions) - just:
>   - Auth middleware (verify token)
>   - MCP proxy (forward to mcp.js tools)
>   - Optional cache layer
> - Backend: **Reuse existing /lib** - no new code!
>
> **The "Thin Wrapper" Pattern:**
> ```
> /srv/admin/api.js          ← HTTP endpoints
>   → verifyToken()          ← encrypt.verifyToken()
>   → mcp.execute(tool,args) ← call 158 MCP tools
>   → cache.get/set          ← optional brain state cache
> ```
>
> **Why this works:**
> - mcp.js already has 158 tools = the API
> - server.js has HTTP patterns to copy
> - cache.js for brain state caching
> - event.js for real-time (PubSub)
> - encrypt.js for No-DB auth
> - **No new backend needed** - just thin wrappers!

> Leverages existing /lib Legos:
> - auth.js: API keys, tokens, lockout
> - encrypt.js: HMAC signing, AES-256-GCM
> - event.js: Real-time via PubSub
> - network.js: HTTP calls to MCP
> - qos.js: Rate limiting

---

## v0.9.0 - Futures

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
