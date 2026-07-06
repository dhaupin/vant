# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - TBD

### Feature - Habitat Module (RLS for Islands)

> Multi-tenant brain isolation via habitat boundaries. The organism (sandbox) operates within a habitat (boundaries).

**Design (2026-07-05):**
- **Problem**: Islands need resource-level access control beyond sandbox capabilities
- **Solution**: New `habitat.js` module - extends organism/habitat analogy
- **Scope**: Resource-level (which islands) + field-level (masking)

**Architecture:**
```
┌─────────────────────────────────────────────┐
│  lib/habitat.js (NEW MODULE)              │
│  - canAccess(island, user, mode)          │
│  - filter(island, data, user)             │
│  - mask(island, data, user)               │
│  - Default policies: readableBy, writableBy │
└─────────────────────────────────────────────┘
                     ↑
                     │ wraps
                     ↓
┌─────────────────────────────────────────────┐
│  lib/islands.js                            │
│  - load(name, userContext?) → passes user  │
│  - save(name, data, userContext?)         │
└─────────────────────────────────────────────┘
```

**Concepts:**
- `sandbox` = organism abilities (what you CAN do globally)
- `habitat` = resource boundaries (what's AVAILABLE to you)
- Duality pattern: data (islands) ↔ policy (habitat)

**User Context:**
- From token: `encrypt.signToken({ userId, role, team, scopes })`
- Passed through MCP → islands.load(name, userContext)

**RLS Policy Fields:**
- `readableBy`: ['user:123', 'team:engineering', 'role:admin']
- `writableBy`: ['user:123', 'role:admin']
- `filter`: Function to filter rows based on user
- `mask`: Field-level masking (partial reveal)

**Placement:** New file `lib/habitat.js` wrapping `lib/islands.js`

---

## [0.8.6] - 2026-06-30

### Feature - Headless Mode (v0.8.6 SCOPE)

> Cloudflare headless mode for agent canvas. MCP→API unified abstraction.

- **API System** (2026-06-30)
  - EXISTS: lib/api.js - Unified CLI/MCP/headless interface (HAS AUTH)
  - EXISTS: lib/mcp.js - JSON-RPC server (158 tools!) - NOW HAS AUTH
  - EXISTS: lib/vant.js - Main runtime, lazy-loads mcp
  - EXISTS: Mode detection (cli/mcp/headless)
  - EXISTS: vant.startFull() - starts MCP server
  - EXISTS: vant.mcp.execute() / listTools()
  - ADDED: MCP↔VANT tool parity (vant.executeTool routes to MCP)
  - ADDED: Auth handler for MCP (config.mcpRequireKey gates access)
  - ADDED: vant.authenticate() - common auth for headless

- **Auth & Pipeline Fixes** (2026-06-30)
  - FIXED: mcpRequireKey now checks config flags before env var
  - FIXED: QoS and Escrow now registered with brain pipeline
  - FIXED: Added execute() to Escrow class for pipeline integration
  - FIXED: Added execute() to QoS module for pipeline integration
  - FIXED: CLI help shows correct VANT_MCP_REQUIRE_KEY env var

- **Architecture** (2026-06-30)
  - Entry: lib/vant.js - Main runtime, 30+ lazy getters
  - Security: lib/framework.js - VAF → QoS → Escrow chain
  - Lifecycle: lib/runop.js - start→run→stop state machine
  - Server: lib/server.js - HTTP/TLS with security chain
  - Search: lib/search.js - query → rerank → hydrate

- **Agent System** (2026-06-30)
  - Max 4 agents (you + 3 coworkers)
  - spawn(), delegate(), delegateAsync(), fork(), join()
  - lib/agents.js with sandbox protection

- **Messaging** (2026-06-30)
  - lib/msg.js - Conversations (with history), Channels (IPC), Encryption
  - lib/stream.js - enqueue(), poll(), complete(), lease()

- **Cloudflare Integration** (2026-06-30)
  - TODO: CF Functions folder location
  - TODO: lib/connectors/cloudflare.js integration
  - TODO: KV/R2/Workers adapters

- **Admin UI** (2026-06-30)
  - TODO: MCP tool exposure for brain CRUD
  - TODO: Geometry storage tools (barcodes)
  - TODO: Canvas/sharing tools

> Original intent: VANT gates all endpoints as OS functions
> - vant.execute(tool, args) wraps all operations
> - Security chain: VAF → Sandbox → QoS → Auth → Escrow

## [0.8.6] - 2026-05-30

### Feature - AI-First Runtime Interoperability (v0.8.6)

- **Event Wiring** (2026-05-30)
  - ADDED: Events emitted by core vant.js operations
    - agent:initialized - on vant.init() complete
    - think:complete - on vant.think() with insights count
    - learn:saved - on vant.learn() with key/category
    - module:discovered - when registry builds with module count
    - act:executing/completed/failed/blocked - operation lifecycle
  - Event system available via lib/event.js

- **Auto-Islands** (2026-05-30)
  - ADDED: Auto-hydrate islands in vant.init()
    - Detects agent identity + role
    - Calls islands.findTriggers() for context
    - Auto-hydrates relevant islands

- **Security Chain** (2026-05-30)
  - ADDED: Full security chain in vant.act()
    - VAF validation (input schema checking)
    - QoS rate limiting (1000 ops/min per type)
    - Escrow quota check (budget enforcement)
    - Lock serialization (concurrent safety)
  - Previously only had lock + audit

- **Discovery Registry** (2026-05-30)
  - ADDED: vant.buildRegistry() - auto-scan lib/*.js
  - ADDED: vant.discover({ capability: 'security' }) - filter by capability
  - ADDED: vant.findByCapability('memory') - list by type
  - Maps 63 modules across 10 capabilities:
    - memory, search, agency, security, compute
    - network, events, scheduling, observability, config
  - Auto-emits module:discovered event

- **System Dashboard** (2026-05-30)
  - EXTENDED: system.status() now returns:
    - boot: layer initialization state
    - events: listener count, uptime
    - discovery: modules, capabilities, byCapability
    - services: compute, embed, storage... (unchanged)
  - ADDED: getLayerStatus(), isOperationAllowed() framework interface

- **User Extensibility** (2026-05-30)
  - 3 ways to extend without touching core:
    1. Add .js file to lib/ (auto-discovered)
    2. Add connector to lib/connectors/ (auto-loaded)
    3. Subscribe to event system (no file needed)
  - Hook into: agent:initialized, think:complete, learn:saved, act:*, module:*

- **Batch 2: Memory Trio Interoperability** (2026-05-30)
  - ADDED: storage.js events
    - storage:saved - when file written with category/key/size
    - storage:loaded - when file read with path
    - storage:deleted - when file removed
    - storage:miss - when get() returns null
    - storage:checked - when has() returns true
    - storage:error - on sandbox denials
  - ADDED: search.js events
    - results:found - when query returns hits
    - search:empty - when LTC missing
    - pipeline:executed - when rerank+compress completes
  - ADDED: cache.js events
    - cache:set/onRemove/hit/miss/expired/evicted/cleared
    - cache:flushing/flushed - DUALITY bridge events

- **Batch 3: Config Centralization** (2026-05-30)
  - ADDED: config:changed event
    - Emits on setFlag() when value actually changes
    - Includes oldValue and newValue for observers

- **Batch 4: Boot System Visibility** (2026-05-30)
  - ADDED: boot events
    - boot:starting - on init() start with taskId/scopes
    - layer:loaded - each layer init with order/count
    - boot:complete - full stack ready with layers/uptime
  - FIXED: escrow require path ('./lib/escrow' → './escrow')
  - ADDED: boot.getBootState() - state exposed to system.js
  - ADDED: boot → system.status().boot now shows full layers

- **Batch 5: Duality Bridge** (2026-05-30)
  - ADDED: cache.flush() - returns entries for persistence
    - Clears memory cache, returns [{key, value, timestamp}]
    - Emits cache:flushed with entry list
    - Enables temp ↔ persist tiering
  - Storage listeners can subscribe and persist flushed data

- **Batch 6: Heartbeat Systems** (2026-05-30)
  - ADDED: cron.js events
    - task:scheduled/running/completed/failed
    - job:started/completed/failed (JobWorker)
  - ADDED: metrics.js events
    - metric:milestone - every 100 increments
    - metric:spike - gauge changes >50%
  - ADDED: islands.js events
    - island:hydrated/dehydrated/hydrate:failed
  
- **Batch 7: Coordination Systems** (2026-05-30)
  - ADDED: consensus.js events
    - vote:cast/quorum/consensus
  - ADDED: network.js events
    - network:checking/online/offline
    - network:blocked (capability/domain)
    - network:cache:hit/miss
    - network:request:start/success/error/timeout
  - FIXED: network.js checkOnline() URL parsing bug

- **Batch 8: API & Integration** (2026-05-30)
  - ADDED: api.js events
    - api:executing/executed/auth:failed/error
  - ADDED: sync.js events
    - sync:push:starting/complete/failed
    - sync:pull:starting/success/failed
  - ADDED: audit.js events
    - audit:info/warn/error
    
- **Batch 9: Compute & Embed** (2026-05-30)
  - ADDED: compute.js events
    - compute:invoking/invoked
    - compute:eval:starting/complete
    - compute:run:starting/complete
  - ADDED: embed.js events
    - embed:generating/generated
    - embed:batch:starting/complete

- **Batch 10: Infrastructure** (2026-05-30)
  - ADDED: theme.js events
    - theme:apply
  - ADDED: escrow.js events
    - escrow:budget:check
    - escrow:spend:recorded
    - escrow:execute:before/check/after
  - ADDED: branch.js events
    - branch:checked-out
    - branch:committed
  - ADDED: lock.js events
    - lock:acquired
    - lock:released

- **Batch 11: Core Systems** (2026-05-30)
  - ADDED: brain.js events - brain:cache:hit, brain:loading, brain:loaded
  - ADDED: auth.js events - auth:validated, auth:failed
  - ADDED: mcp.js events - mcp:request/response/error
  - ADDED: lineage.js events - lineage:recorded
  - ADDED: error.js events - error:retry/attempt/exhausted
  - ADDED: vaf.js events - vaf:blocked
  - ADDED: stego.js events - stego:encoded, stego:decoded
  - ADDED: agents.js events - agent:spawned, agent:delegating, agent:delegated

- **Batch 12: Utilities** (2026-05-30)
  - ADDED: format.js events - format:parsed
  - ADDED: update.js events - update:check
  - ADDED: canvas.js events - canvas:painted

- **Batch 13: Security + Infrastructure** (2026-05-30)
  - ADDED: encrypt.js events - encrypt:encrypted, encrypt:decrypted
  - ADDED: shell.js events - shell:exec
  - ADDED: security.js events (header)
  - ADDED: qos.js events - qos:rate-limit
  - ADDED: stream.js events - stream:enqueued, stream:polled, stream:completed
  - ADDED: sudo.js events - sudo:escalation

### Feature - Multi-Agent Orchestration (v0.8.7)
- **MCP Agent Tools** (2026-05-13)
  - ADDED: agent_spawn - Spawn new agent (max 4: you + 3 others)
  - ADDED: agent_list - List active agents with IDs and states
  - ADDED: agent_kill - Kill agent by ID
  - MCP server now exposes /rpc endpoint with brain_* prefixed tools

- **Agent Quota** (2026-05-13)
  - ADDED: MAX_AGENTS = 4 limit enforced in spawn()
  - Returns error when quota reached

- **Orchestrator** (2026-05-13)
  - ADDED: agents.delegate(id, task) - Assign job to specific agent
  - ADDED: msg.send(channel, message) - Broadcast to channel
  - ADDED: Full vant↔brain↔agent↔msg loop wired

- **Agent-Brain Wiring** (2026-05-13)
  - agents.spawn() → brain.attend(name) tracks attention
  - agents.spawn(parent) → brain.fireSynapse(parent→child)
  - msg.post() → brain.attend(conversation)

### Feature - Git Provider Parity (v0.8.6)
- **Multi-Provider Support** (2026-05-10)
  - ADDED: GitLabProvider with full API (issues, MRs, pipelines)
  - ADDED: BitbucketProvider with full API (PRs, repo details)
  - ADDED: SelfHostedProvider with git CLI operations
  - ADDED: Unified getProvider() factory in lib/remotes.js
  - All providers share common API: issues, comments, PRs, repo, branches, status
  - Provider-specific features: GitHub Actions, GitLab Pipelines, Bitbucket Issues

- **Sandbox Refactor - Execution Keeper** (2026-05-10)
  - REFACTORED: sandbox.js - now delegates to qos, lock, network
  - ADDED: domain whitelist to network.js (isDomainAllowed, setAllowedDomains)
  - ADDED: network.fetch() domain checks
  - WIRED: sandbox into framework.js, vant.js, api.js (fully integrated)
  - REMOVED: duplicate quota/concurrency in sandbox (uses qos.RateLimiter)
  - REMOVED: direct lock usage (delegates to lock module)
  - Role: Agent/Node execution isolation "keeper"

- **Sandbox Keeper Features** (2026-05-10)
  - ADDED: budget delegation to escrow (getBudgetStatus, recordSpend)
  - ADDED: capability flags (canRead, canWrite, canNetwork, canSpawn, canCommit, etc.)
  - ADDED: operation scopes (read, write, network, spawn)
  - ADDED: getCapabilities(), setCapabilities(), can(cap)
  - ADDED: getScopes(), setScopes(), hasScope(scope)
  - ADDED: getOperationHistory(), getErrors()
  - ADDED: isolate() for untrusted sub-sandbox
  - Full keeper integration: agents now have proper guards/lanes

- **Runtime Gate Integration** (2026-05-10)
  - ADDED: capability gate to network.fetch() (checks canNetwork)
  - ADDED: capability gate to agents.spawn() (checks canSpawn)
  - ADDED: capability gate to msg.post() (checks canWrite)
  - ADDED: CircuitBreaker from qos (trips on failures)
  - All runtime operations now protected by sandbox
  - Full gate map: network → agents → msg → sandbox

### Breaking Changes (v0.8.6)
- **Consolidated Cache Module** (2026-05-09)
  - REMOVED: memoize.js, compression.js, pool.js, cache.js, cache-control.js
  - NEW: unified lib/cache.js (LRU cache + compression + buffer pool)
  - All consolidate into single cache module
  - No backward compatibility - v0.8.6 is breaking

- **Deleted Unused Search/Query Modules** (2026-05-09)
  - DELETE: rerank.js (in search.js already)
  - DELETE: search-hyde.js (in search.js)
  - DELETE: search-hybrid.js (in search.js)
  - DELETE: query-builder.js (unused)
  - DELETE: rate-limit.js (qos has it)
  - DELETE: pipeline.js (unused)

- **Unified Event Module** (2026-05-09)
  - NEW: lib/event.js (Event + PubSub + Queue + Job)
  - MERGED: event-bus.js, queue.js, job_worker.js, throttler.js, debouncer.js
  - Renamed class: Event (was EventBus)
  - Added: Queue + Job classes
  - Added: framework interface (getLayerStatus, isOperationAllowed)

- **Deleted Unused HTTP Modules** (2026-05-09)
  - MERGED: body-parser, cors, helmet, middleware-stack, session, session_store → server.js
  - integrated: BodyParser, CORS, Helmet, MiddlewareStack, Session, SessionStore

- **Unified QoS + Throttler + Debouncer** (2026-05-09)
  - MERGED: throttler.js, debouncer.js → qos.js
  - Added: Throttler, Debouncer classes
  - Added: QoS.throttle(), QoS.debounce()

- **JobWorker in Cron** (2026-05-09)
  - MERGED: job_worker.js → cron.js
  - Added: JobWorker class

- **Delete Deprecated Wrappers** (2026-05-09)
  - DELETE: audit-log.js, metrics.js, storage.js, buffer.js, entropy.js, serializer.js, load.js, horcrux.js, env.js
  - 9 deprecated wrappers removed

- **Sanitize + IPFilter in VAF** (2026-05-09)
  - MERGED: sanitize.js + ip-filter.js → vaf.js
  - Added: VAF.Sanitize, VAF.IPFilter classes

- **Hybrid-Sync in Sync** (2026-05-09)
  - MERGED: hybrid-sync.js → sync.js
  - Added: hybrid_getPrivacyConfig, hybrid_setPrivacy, hybrid_getPublicRepos, hybrid_getPrivateRepos

- **ErrorHandler in Errors** (2026-05-09)
  - MERGED: error-handler.js → errors.js
  - Added: errors.ErrorHandler class

### Added
- **Vant Class + Agent Runtime** (2026-05-09)
  - lib/runtime.js → lib/vant.js: Renamed main module
  - NEW: Vant class - ultimate agent with full system access
  - lazy-loads all core systems: brain, search, islands, config, memoize, lock, audit, compression
  - NEW: vector-store.js, cron.js, conversation.js modules added
  - OS features merged: encrypt shortcuts, QoS, stego, agents, ipc
  - getLayerStatus() + isOperationAllowed() - standard interface
  - framework.js, agents.js updated to use vant.js

### Changed
- **Runtime renamed to Vant** (2026-05-09)
  - runtime.js → vant.js
  - framework.js updated
  - agents.js updated

### Added
- **Core Modules for Vant Class** (2026-05-09)
  - lib/vector-store.js: Local embedding-based semantic memory
  - lib/cron.js: Task scheduling with setInterval
  - lib/conversation.js: Shared context between agents
  - Used by new Vant class runtime

## [0.8.6] - 2026-05-08
### Changed
- **Search Consolidation** (2026-05-08)
  - lib/search.js: Unified search + rerank + hybrid + hyde
  - lib/rerank.js, lib/search-hybrid.js, lib/search-hyde.js: Deleted
  - Consumers updated: bin/mcp.js, bin/search.js, bin/rerank.js
  - New exports: rerank, compress, pipeline, stripFluff
- **Config+Env Merge** (2026-05-08)
  - lib/config.js: Now exports all VANT_* envvars
  - lib/env.js: Deleted - all exports moved to config
  - Consumers updated: server.js, auth.js, api.js, bin/node.js, bin/mcp.js

- **Pool Consolidation** (2026-05-08)
  - lib/pool.js: Unified class for buffer + storage + resources
  - lib/buffer.js, lib/storage.js: Deleted - merged into pool
  - framework.js updated: require pool instead of buffer/storage

- **Audit Unification** (2026-05-08)
  - lib/audit.js: Unified audit + metrics + user tracking
  - lib/audit-log.js, lib/metrics.js: Deleted - merged into audit

### Deleted
- lib/env.js
- lib/buffer.js
- lib/storage.js
- lib/audit-log.js
- lib/metrics.js

### Fixed
- framework.js: _configFlag not defined
- test/coverage.js: horcrux require → stego

## [0.8.5] - 2026-05-07
### Added
- **Encrypt Class**
  - New lib/encrypt.js: Consolidated crypto handlers pool
  - All crypto operations now use Encrypt

### Changed
- **Search Consolidation** (2026-05-08)
  - lib/search.js: Unified search + rerank + hybrid + hyde
  - lib/rerank.js, lib/search-hybrid.js, lib/search-hyde.js: Deleted
  - Consumers updated: bin/mcp.js, bin/search.js, bin/rerank.js
  - New exports: rerank, compress, pipeline, stripFluff
- **HTTP Server Consolidation**
  - server.js: Merged Request, Response, Router, Static inner classes

