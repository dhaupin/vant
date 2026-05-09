# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.6] - 2026-05-08
### Changed
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
- **HTTP Server Consolidation**
  - server.js: Merged Request, Response, Router, Static inner classes

