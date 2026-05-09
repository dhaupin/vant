# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes (v0.8.6)
- **Consolidated Cache Module** (2026-05-09)
  - REMOVED: memoize.js, compression.js, pool.js, cache.js, cache-control.js
  - NEW: unified lib/cache.js (LRU cache + compression + buffer pool)
  - All consolidate into single cache module
  - No backward compatibility - v0.8.6 is breaking

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

