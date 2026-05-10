# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Feature - Git Provider Parity (v0.8.7)
- **Multi-Provider Support** (2026-05-10)
  - ADDED: GitLabProvider with full API (issues, MRs, pipelines)
  - ADDED: BitbucketProvider with full API (PRs, repo details)
  - ADDED: SelfHostedProvider with git CLI operations
  - ADDED: Unified getProvider() factory in lib/remotes.js
  - All providers share common API: issues, comments, PRs, repo, branches, status
  - Provider-specific features: GitHub Actions, GitLab Pipelines, Bitbucket Issues

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

