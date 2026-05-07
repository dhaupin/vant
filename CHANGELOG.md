# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Framework: 6-Layer Operational Stack**
  - All 6 layers now run at same global scope: VAF → Sandbox → QoS → Security → API → Escrow
  - `lib/framework.js` - Updated for 6 layers
  - Each layer has `isOperationAllowed()` and `getLayerStatus()` for framework integration
- **API Layer** (NEW - lib/api.js)
  - Unified interface for CLI/MCP/headless
  - Pre/post execution hooks: `onBeforeExecute()`, `onAfterExecute()`, `onError()`
  - Mode detection: `getMode()` returns 'cli' | 'mcp' | 'headless'
  - `isOperationAllowed()` and `getLayerStatus()` for framework integration
- **Escrow Layer** (lib/escrow.js - Placeholder)
  - Separate class for budget tracking and holds
  - Methods: `canSpend()`, `hold()`, `release()`, `checkHold()`
  - Placeholder - handler NOT implemented yet
  - `isOperationAllowed()` and `getLayerStatus()` return placeholder responses
- **VAF Layer Enhancement** (Batch 1)
  - VAF class with `create()` for custom instances
  - `getConfig()`/`setConfig()` for runtime config changes
  - `reloadConfig()` for config reload
  - `getLayerStatus()` for framework reporting
- **Sandbox Layer** (Batch 2)
  - Read/write separation (picking up vs doing)
  - Read: 100/min quota, 3 concurrent, higher timeouts
  - Write: 20/min quota, serialized, optional lock requirement
  - Network domain restrictions via `allowedDomains`
  - `isOperationAllowed()` check before execution
- **QoS Layer Enhancement** (Batch 3)
  - `isOperationAllowed()` for operation type checks
  - `getLayerStatus()` for framework reporting  
  - Integrated with protection.js (circuit breaker, concurrency limits)
- **Security Layer** (Batch 4)
  - API key validation via `validateApiKey()`
  - Encryption/decryption via stego
  - Lock token validation
  - `isOperationAllowed()` for auth checks

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