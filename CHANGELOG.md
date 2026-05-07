# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Framework: 62-Layer Operational Stack** (2026-05-07)
  - All 62 layers run at same global scope
  - `lib/framework.js` - Updated for 62 layers

- **API Infrastructure Classes** (9 new)
  - `server.js` - HTTP server wrapper (listen/start/stop)
  - `middleware-stack.js` - Chain middleware handlers
  - `query-builder.js` - SQL query builder (select/insert/update/delete)
  - `sanitize.js` - Input sanitization (stripHtml, escapeSQL, escapeHTML)
  - `migration.js` - DB migration manager
  - `socket-io.js` - Socket.IO wrapper with rooms
  - `rate-limiter.js` - HTTP rate limiting (X-RateLimit headers)
  - `ip-filter.js` - IP allow/deny list

## [Unreleased]
- **Framework: 53-Layer Operational Stack** (2026-05-07)
  - All 53 layers run at same global scope
  - `lib/framework.js` - Updated for 53 layers
  - Each layer has `isOperationAllowed()` and `getLayerStatus()`

- **API Framework Classes** (11 new - NEW category: API)
  - `router.js` - Route matching/dispatch (GET, POST, PUT, DELETE)
  - `request.js` - HTTP request abstraction
  - `response.js` - HTTP response abstraction
  - `context.js` - Combined req/res context
  - `body-parser.js` - Parse JSON/form/multipart
  - `cors.js` - Cross-origin resource sharing
  - `error-handler.js` - Centralized error handling
  - `helmet.js` - Security headers
  - `static.js` - Static file serving
  - `cache-control.js` - Cache headers
  - `compression.js` - Gzip compression

- **Infrastructure Utilities** (20 new - NEW category: Utilities)
  - Core: event-emitter.js, serializer.js, storage.js
  - Network: websocket.js, http.js
  - Time: cron-parser.js, timing.js
  - IDs: uuid.js
  - Flow: debouncer.js, throttler.js, retry.js
  - Resilience: circuit-breaker.js, bulkhead.js
  - Data: transformer.js, hash.js, buffer.js
  - Cache: memoize.js, lru.js
  - Validation: validator.js
  - Pooling: pool.js

## [Unreleased] (legacy)
- **Framework: 22-Layer Operational Stack**
  - All 22 layers now run at same global scope
  - `lib/framework.js` - Updated for 22 layers
  - Each layer has `isOperationAllowed()` and `getLayerStatus()` for framework integration
- **Cache Layer** (NEW - lib/cache.js)
  - Unified cache with LRU eviction and TTL expiration
  - `get()`, `set()`, `delete()`, `has()`, `clear()`, `prune()`
  - `getStats()` with hits, misses, evictions
- **Queue Layer** (NEW - lib/queue.js)
  - Async task queue with concurrency control
  - `add()`, `process()`, `getJobStatus()`, `clear()`
  - Job states: pending, running, completed, failed, retry
- **EventBus Layer** (NEW - lib/event-bus.js)
  - Pub/sub event bus for layer-to-layer communication
  - `on()`, `once()`, `emit()`, `off()`
  - Wildcards, priority handlers, async handling
- **Metrics Layer** (NEW - lib/metrics-class.js)
  - Observability wrapper - counters, gauges, timings
  - `increment()`, `decrement()`, `gauge()`, `timing()`
  - System info, retention
- **AuditLog Layer** (NEW - lib/audit-log.js)
  - Audit logging - who did what when
  - `log()`, `query()`, `getUserActivity()`
  - Compliance requirement
- **HealthCheck Layer** (NEW - lib/health-check.js)
  - Dependency health checks, readiness probes
  - `register()`, `check()`, `checkOne()`
  - Timeout handling
- **Pipeline Layer** (NEW - lib/pipeline.js)
  - Hooks and middleware composition
  - `use()`, `remove()`, `execute()`
  - Pre/post execution chains
- **ConfigFlag Layer** (NEW - lib/config-flag.js)
  - Feature flags, runtime config
  - `set()`, `get()`, `enable()`, `disable()`, `toggle()`
- **RateLimit Layer** (NEW - lib/rate-limit-class.js)
  - Per-user rate limiting, sliding window
  - `check()`, `record()`, `remaining()`, `reset()`
- **Session Layer** (NEW - lib/session.js)
  - Request context, correlation IDs
  - `create()`, `get()`, `set()`, `correlationId()`
- **Search: 2-Mode MCP Tool**
  - `vant_search` now has 2 modes: `basic` (text) and `rag` (semantic LTC)
  - Basic: Fast text search across brain files
  - RAG: Semantic search via LTC, context rehydration, compression
  - Available in MCP tool schema
- **Search: Unified API**
  - Single `lib/search.js` for all search modes
  - Exports: searchLTC(), query(), hybrid(), hyde(), getSettings()
  - MCP and CLI use unified lib
  - Available modes: basic, rag, hybrid
- **Search: Configurable Settings**
  - `settings.ini` support for REHYDRATE_MAX_SIZE, COMPRESSION_THRESHOLD, RAG_LIMIT_MAX
  - RAG response includes current settings
- **Agent Skills Format (agentskills.io)**: New skill format compatible with Claude Code, OpenAI Codex, Cursor, and other agents
  - `models/public/vant/SKILL.md` - Skill manifest with YAML frontmatter
  - `models/public/vant/references/context-optimization.md` - Entropy patching, semantic seeds, context budgets
  - `models/public/vant/references/multi-agent.md` - Branch workflow, trust levels, coordination
  - `bin/skills-export.sh` - Export utility for agent skills
- **MCP Extended Tools**: 11 new tools added (total 20)
  - Islands: vant_get_islands, vant_load_island
  - Resolution: vant_resolution_track
  - Stego: vant_stego_encode, vant_stego_decode
  - Config: vant_config_get, vant_config_set
  - Audit: vant_audit_log, vant_audit_list
  - Trust: vant_succession_info
  - Search: vant_search (2-mode: basic text + RAG semantic)

## [0.8.6] - 2026-05-05

### Added
- **Code Block Styling**: Syntax highlighting (tok-com, tok-kw, tok-str, tok-var)
- **CSS DSL**: Semantic classes (.ma-t, .pa-l, .term, .term-sm)
- **main Landmark**: Screen reader accessibility
- **robots.txt**: SEO crawler rules
- **sitemap.xml**: 10 docs URLs with priorities
- **Enhanced Schemas**: SoftwareApplication + FAQPage JSON-LD
- **Cloudflare Analytics**: Web Analytics + Zaraz tracking
- **MCP Tools**: 9 tools (get/set memory, branches, commit, sync, lock, health)

### Fixed
- **Code Block HTML**: Proper nesting `<pre><code>...</code></pre>`
- **Malformed Tags**: Missing </code> close tags
- **Inline Styles**: Reduced from 6 to 0

### Changed
- **CLI Code Block**: Now uses `<pre class="term"><code>`