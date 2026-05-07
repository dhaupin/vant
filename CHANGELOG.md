# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **MCP Bind Address Restriction** (2026-05-07)
  - Default to 127.0.0.1 (localhost only)
  - Configurable via MCP_BIND_ADDRESS env var
  - Added env.mcpBindAddress() method
  - lib/server.js defaults to localhost

### Fixed
- **Path Traversal Protection** (2026-05-07)
  - Config blocks .. in paths

### Fixed (2026-05-07)
- **VAF tryCatch option**
  - Added `{tryCatch: true}` option to validateString
  - Returns `{valid: false, reason: '...'}` instead of throwing
  - All validation checks support this option
- **Config prototype block**
  - Block `__proto__`, `constructor`, `prototype` keys in get()
  - Prevents prototype pollution attacks
- **Protection counter**
  - decrementActive() now prevents going below 0
- **checkCommandStacking** (FIXED BUG)
  - Now uses DANGEROUS_PATTERNS instead of broken regex
  - Was: always returned `{blocked: false}` (BUG)
  - Now: properly blocks command injection

### Verified
- **MCP HTTP smuggling** (2026-05-07)
  - Not applicable - MCP uses WebSocket, not HTTP
  - Low risk for localhost-only service

### Security Scan Results (Batch 17-20)
- **Edge cases**: Null bytes blocked, deep objects limited (depth 5)
- **Auth enumeration**: All return false for invalid keys
- **Event emitter**: 500 listeners allowed (controlled)
- **Webhooks, IP filter, Cron parser**: All functional
- **Config**: null/undefined/empty/../__proto__ all return undefined

### Security Fixes (Batch 22)
- **checkCommandStacking**: Now properly uses DANGEROUS_PATTERNS
- **SQL Injection**: Now blocked (was not blocked)
  - Added 12 patterns: UNION SELECT, DROP TABLE, INSERT INTO, etc
- **Command injection**: Now blocked (was broken)

### Batches 23-28 Scan Results
- **Input validation**: maxLength works, control chars blocked
- **Edge cases**: Empty, whitespace, Unicode handled
- **Flow layers**: Debouncer, Throttler, Retry, CircuitBreaker all functional
- **Data layers**: Transformer, Buffer, LRU, Pool all functional
- **Network layers**: WebSocket, HTTP, Socket.IO all functional
- **Utility modules**: HealthCheck, AuditLog, EventBus, Pipeline all functional
- **Full security**: All vectors blocked (XSS, SQLi, Cmd, Path, Proto)

### Batches 29-34 Scan Results
- **Utility modules**: Prune, Version, Sync all functional
- **Data modules**: Migration, Repos, Load, Stego all functional  
- **Progress**: Progress, Resolution, Onboard, Gallery all functional
- **Security**: All vectors still blocked (verified)

### Batch 35 Fixes
- **bin/node.js**: Fixed missing env require, added path resolution
- **lib/env.js**: Added missing module exports (githubRepo, agreeAutoSync)
- **bin/webhook.js**: Renamed to webhook.sh (was bash with .js extension)

### Scanned
- Shell injection: All exec/spawn uses are internal git operations with controlled inputs
- Eval: None found
- SQL/NoSQL injection: Not applicable (no DB)
- Hardcoded secrets: None found
- XSS: Handled by VAF (maxStringLength)

### Added
- **Auth Lockout Duration** (2026-05-07)
  - Configurable lockout: lockoutDuration (default: 60000ms = 1min)
  - Auto-unlock after duration expires
  - getAuthStatus() returns remaining seconds
  - Instance option: new API({ lockoutDuration: 5000 })

- **Extended config.example.ini** (2026-05-07)
  - VANT_API_KEY, MAX_AUTH_FAILURES, AUTH_LOCKOUT_DURATION
  - VAF_RATE_LIMIT_WINDOW, VAF_MAX_CONCURRENT

- **MCP /tools Endpoint Fix** (2026-05-07)
  - /tools now requires auth when MCP_API_KEY set
  - /health reduced info leak (no uptime)

### Added
- **Integration Documentation** (2026-05-07)
  - VAF integrated with API and Framework (input validation layer)
  - QoS integrated (rate limiting, circuit breaker)
  - Debouncer/Throttler available in Framework
  - Hooks: onBeforeExecute, onAfterExecute, onError
  
- **Full Execution Stack** (2026-05-07)
  - 1. API.execute() called
  - 2. authenticate() - rate limit auth failures (max 5)
  - 3. onBeforeExecute() hooks
  - 4. Framework layers:
    - a. VAF.isOperationAllowed() - input validation
    - b. Security.isOperationAllowed()  
    - c. QoS.isOperationAllowed() - rate limit + circuit
    - d. Sandbox.execute() - isolation
  - 5. onAfterExecute() hooks
  - 6. Return result

- **Rate Limiting & Circuit Breaker** (2026-05-07)
  - QoS: maxConcurrent (default 3)
  - QoS: circuitThreshold (default 5 failures)
  - QoS: circuitWindow (default 60s)
  - QoS: canProceed(), isCircuitOpen(), resetCircuit()

- **Auth Rate Limiting** (2026-05-07)
  - Max auth failures: 5 (configurable)
  - After 5 failures: auth locked until reset


### Added
- **lib/env.js** (2026-05-07)
  - New Env class for unified environment variable handling
  - Handles all VANT_*, GITHUB, LINEAR, SMTP, notification env vars
  - Platform detection: node, cloudflare, vercel, netlify, docker, kubernetes
  - Used by api.js, mcp.js, node.js for key/config retrieval

- **lib/api.js Security Update** (2026-05-07)
  - ALL API endpoints now require VANT_API_KEY auth
  - getMode, getStatus, getLayerStatus, getAuthStatus blocked without key
  - setSecret, requireAuth, setMode require valid key
  - Auth via context.secret or process.env.VANT_API_KEY
  - Bootstrap: setSecret works without key if no secret configured yet

- **bin/mcp.js Updates** (2026-05-07)
  - Uses env.js for MCP config (mcpPort, mcpApiKey, mcpRequireKey)
  - Environment variables now unified through lib/env.js

- **bin/node.js Updates** (2026-05-07)
  - Uses env.js for GitHub config (githubToken, githubRepo)
  - Uses env.js for AgreeAutoSync setting
  - Uses env.js for MCP port default


- **Framework: 67-Layer Operational Stack** (2026-05-07)
  - All 67 layers run at same global scope

- **Infrastructure Classes** (5 new)
  - `service-container.js` - Dependency injection
  - `job_worker.js` - Background job processing
  - `pubsub.js` - Publish/subscribe events
  - `session_store.js` - Session storage
  - `config` - Updated with framework methods

- **API Infrastructure Classes** (9 new - batch 2)

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