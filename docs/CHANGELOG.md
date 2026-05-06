---
version: 0.8.6
permalink: /CHANGELOG
layout: default
title: CHANGELOG
nav_order: 101
---

# CHANGELOG

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0).

---

## [v0.8.6] - 2026-05-06 - Reliability Improvements Release

### Added

- **Rerank (RAG)** - New rerank module for keyword reranking and LLM context compression:
  - CLI: `vant rerank <query>`, `vant rerank compress`, `vant rerank pipeline`
  - MCP: `vant_rerank` tool (21 MCP tools total)
  - 3 modes: rerank (keyword score), compress (token budget), pipeline (both)
  - Docs: [docs/guides/rerank.md](guides/rerank)
- **hybrid-sync.js** - Renamed `lib/hybrid.js` → `lib/hybrid-sync.js` for clarity

### Fixed

- **VAF newline blocking** - Learned that blocking `\n` in all strings breaks multi-line memory content (learnings, memories, etc). Now supports `allowContent: true` option to bypass content checks for valid memory content.
- **Circuit breaker** - Changed from aggressive 3-failure/60s-reset to 5-failure with exponential backoff (1s -> 30s max)
- **Lock race conditions** - Increased from 3 attempts/50ms fixed to 5 attempts with exponential backoff (50ms -> 1s max)
- **Unicode keys** - Changed from `[a-zA-Z0-9_-]` to blocking only path-unsafe chars `/ \ : * ? " < > |`

### Security

- New `AUDIT_PATTERNS` array separates content blocking from audit-log protection
- Added `category` field to VAF audit for memory content tracing
- Configurable circuit breaker and lock parameters exported for tuning

### API Changes

```javascript
// VAF - allow newlines in memory content
vaf.check(content, { type: 'string', allowContent: true, category: 'learnings' });

// Lock - configure via exported config
lock.LOCK_CONFIG.MAX_ATTEMPTS;         // 5 (was 3)
lock.LOCK_CONFIG.BASE_BACKOFF_MS;       // 50 (was 50 fixed)
lock.LOCK_CONFIG.MAX_BACKOFF_MS;       // 1000

// Sync circuit - exported config
sync.getAllCircuits().config.FAILURE_THRESHOLD;  // 5 (was 3)
```

---

## [v0.8.6] - 2026-05-05 - Search Caching Release

### Added

- **Session caching** for hybrid search results (50 max, MD5-keyed)
- **Lazy-load** of search-hybrid module (heavy, on-demand)
- **Compact mode** in query() - summaries only, skip full rehydration
- **Cache APIs**: clearCache(), getCacheStats()
- **CLI --compact flag** for quick summaries
- **MCP compact option** for vant_search tool

### Refactored

- **Test suite rename**: `bin/test-v086.js` → `bin/test-core.js`
- **CLI rename**: `vant test v086` → `vant test core`

### Search API

```javascript
// Session caching
const r1 = await search.hybrid('python');  // First call
const r2 = await search.hybrid('python');  // Cached!

// Compact mode
const { results, context } = await search.query('python', { compact: true });

// Cache management
search.getCacheStats();  // { size: 1, max: 50 }
search.clearCache();
```

### CLI/MCP

```bash
# CLI
vant search python --mode rag --compact

# MCP
{ "name": "vant_search", "arguments": { "query": "python", "mode": "rag", "compact": true } }
```

### Security

Unchanged - query limits (500 char), rehydrate limits (50KB), compression threshold (5KB) still enforced.

---

## [v0.8.6] - 2026-05-05 - Islands Release

### ⚠️ MAJOR ARCHITECTURE UPDATE

Implements Prestruct's "Islands of Interactivity" for AI memory.
Turns Vant from a "storage utility" into a "Distributed Operating System."

#### Testing Infrastructure (v0.8.6 Checkpoint)

| Metric | Before | After |
|--------|--------|-------|
| Total tests | 147 | 163 |
| Test runners | 4 | 4 |
| CI jobs | 4 | 3 |
| CI time | 5+ min | ~3 min |
| Module coverage | ~38% | 100% |

**Consolidated test runners:**
- `test/ci.js`: Syntax, file validation (76 tests)
- `test/runner.js`: Functional tests (44 tests)
- `test/evals/vibe.js`: QC trigger checks (7 evals)
- `test/coverage.js`: All lib modules (43 tests) **NEW**

**Full module coverage:**
- lib/schema.js ✓
- lib/audit.js ✓
- lib/citations.js ✓
- lib/islands.js ✓
- lib/state.js ✓
- lib/vibe.js ✓
- lib/search-hybrid.js ✓
- lib/search-hyde.js ✓
- lib/rerank.js ✓
- lib/repos.js ✓
- lib/hybrid.js ✓
- lib/gallery.js ✓
- lib/horcrux.js ✓
- lib/search.js ✓
- (all 42 lib modules covered)

**Audit report:**
- Real test counts: `| Passed | 163 |`

#### Islands Architecture (Componentized Brain)
- Split brain into lazy-loadable islands (skills/knowledge blocks)
- Static islands: identity, learnings, decisions (always loaded)
- Lazy islands: github, herbalism, vesc, linear, automation (on trigger)
- Auto-hydrate based on prompt context

```javascript
const islands = require('./lib/islands');

// Find islands matching trigger
const found = islands.findTriggers('github pr issue');
// ['github']

// Auto-hydrate based on prompt
const toLoad = islands.autoHydrate('fix the github pr');
// ['identity', 'learnings', 'decisions', 'github']

// Hydrate specific island
await islands.hydrate('github');
```

#### State Separation (Static vs Hydrated)
- Static state: Immutable facts, identity (never changes)
- Current state: Active task (per prompt)
- Temp state: Temporary variables (wiped on prune)

```javascript
const state = require('./lib/state');

// Static: Immutable
state.setStatic({ name: 'Vant', version: '0.8.6' });
state.getStatic('name'); // 'Vant'

// Current: Active task
state.setCurrent({ task: 'fix bug', target: 'github' });

// Temp: Wiped on prune
state.setTemp({ cache: {} });
state.clearTemp();
```

#### Stego Gallery (Linked Image Chunks)
- Each island can be its own stego PNG
- Gallery of images, lazy-loaded
- Link to brain manifest

```javascript
const gallery = require('./lib/gallery');
gallery.saveImage('github', pngBuffer);  // Save island
const img = gallery.loadImage('github'); // Load
gallery.linkToBrain(); // Link to brain
```

#### Horcrux Manifest (Encrypted Bootstrap)
- Encrypted configuration in stego images
- Zero-config boot from image URL
- Provider URLs in manifest (no tokens!)

```javascript
const horcrux = require('./lib/horcrux');

const manifest = horcrux.generateManifest({
    provider: 'github',
    primaryUrl: 'https://github.com/user/repo',
    secondaryUrl: 'https://gitlab.com/user/repo'
});

const bootstrap = horcrux.createBootstrap(manifest, 'password');
```

#### RAID Sync + Rebase
- Rebase stale providers when they recover
- Provider state tracking (.providers.json)
- marks providers as "stale" on failure, "healthy" on success

```javascript
const sync = require('./lib/sync');

await sync.rebase('github'); // Catch up stale provider
sync.markStale('github'); // Mark as stale
sync.getProviderState('github'); // Get status
```

#### Search + Git History
- Get current commit in search summary
- Fetch historical files from git

```javascript
const search = require('./lib/search');

search.getCurrentCommit(); // '6b0d7e5'
search.fetchFromHistory('models/v0.5.0/learnings/1.md', 'abc123');
```

### New CLI Commands

| Command | Description |
|---------|-------------|
| `vant islands` | Islands boot |
| `vant islands --list` | List all islands |
| `vant islands --prompt <text>` | Auto-hydrate based on prompt |
| `vant islands --island <name>` | Hydrate specific island |

### New Modules

- `lib/islands.js` - Island registry + lazy hydration
- `lib/state.js` - Static/Hydrated state separation
- `lib/gallery.js` - Linked stego image chunks
- `lib/horcrux.js` - Encrypted bootstrap manifest
- `lib/vibe.js` - Dynamic mood controls
- `lib/repos.js` - Multi-repo skills system
- `lib/hybrid.js` - Public/private sync
- `bin/islands-boot.js` - Islands CLI
- `bin/vibe.js` - Vibe CLI
- `bin/repos.js` - Repos CLI
- `bin/hybrid-sync.js` - Hybrid CLI
- `bin/test-core.js` - Test suite

### New Docs

- `docs/guides/islands.md` - Islands guide
- `docs/guides/horcrux.md` - Horcrux manifest guide
- `docs/guides/vibe.md` - Vibe controls guide
- `docs/guides/repos.md` - Multi-repo guide
- `docs/guides/hybrid.md` - Hybrid sync guide

### Trigger Mapping

| Trigger | Island |
|---------|--------|
| github, pr, issue, repo | github |
| gitlab, merge | gitlab |
| bitbucket | bitbucket |
| herb, plant, medicine | herbalism |
| vesc, skateboard, motor | vesc |
| linear, project | linear |
| cron, automation | automation |

#### Vibe Controls (Dynamic Mood)
- Programmatic mood.ini swapping based on task outcome
- Auto-switch to `safety_first` on error, `review` after debugging success
- Vibe-aware git commits: `[vibe:experimental risk=high]`
- 6 moods: experimental, safety_first, focused, learning, debugging, review

```javascript
const vibe = require('./lib/vibe');

vibe.setMood('experimental');
vibe.onTaskSuccess();  // Auto-adjust
vibe.onTaskError();    // → safety_first
vibe.getCommitVibe(); // '[vibe:x risk=y]'
```

#### Multi-Repo Skills (Distributed Brain)
- Mount external repos like drives (github skills, herbalism data, vesc configs)
- Register → mount → pull workflow
- Different privacies per repo

```javascript
const repos = require('./lib/repos');

repos.register('skills', 'https://github.com/user/skills-repo');
await repos.mount('skills');
await repos.pull();
```

#### Hybrid Sync (Public/Private)
- Split brain: sensitive → private repo, logs → public repo
- `pushPublic()` / `pushPrivate()` selective sync
- Privacy config per repo

```javascript
const hybrid = require('./lib/hybrid');

hybrid.setPrivacy('github', 'private');
await hybrid.pushPublic();  // Only public repos
await hybrid.pushPrivate(); // Only private repos
```

#### Hybrid Search (Sparse + Dense)
- BM25 for keywords: exact match "VESC v3.4"
- Vector for semantic: "nature medicine" → "herbalism"
- RRF: Reciprocal Rank Fusion combines both

```javascript
const search = require('./lib/search-hybrid');
await search.search('herbalism plants');
```

#### Query Transformation (Multi-Query + HyDE)
- Multi-Query: Generate 3 variations of vague prompts
- HyDE: Write fake answer first, then search real

```javascript
const query = require('./lib/query');
query.multiQuery('how to setup vesc');
await query.hyde('what is herbalism');
```

#### Re-Ranking & Compression
- Score hydrated memories against query
- Strip fluff (headers, metadata)
- Fit context window

```javascript
const rerank = require('./lib/rerank');
const top = rerank.rerank(memories, query);
```

#### Git-Backed Citations
- Force [Source: commit_hash] in answers
- Audit-friendly receipts

```javascript
const citations = require('./lib/citations');
citations.addSource(commitHash, context);
citations.formatCitation(source);
// [Source: abc123d]
```

#### Schema Enforcement (Validation)
- Strict JSON Schema for brain.json, _core.json
- Prevent corrupted states from hydrating
- `vant validate --check` CLI

```javascript
const schema = require('./lib/schema');
schema.isValid();
schema.validateFile('brain.json');
```

#### Audit Ledger
- Append-only, tamper-proof ledger
- Logs: island hydration, stego snapshot, RAID sync
- Hash chain: tamper-evident

```javascript
const audit = require('./lib/audit');
audit.log('island:github:hydrate');
audit.healthCheck();
```

#### Circuit Breakers (RAID Sync)
- 3 failures → circuit open
- Auto-skip failed providers
- Auto-reset after 60s

```javascript
const sync = require('./lib/sync');
sync.isCircuitClosed('github');
// true/false
```

#### Cold Boot Fallbacks
- Triple-redundant: provided URL → local backup → .env
- Auto-try all sources on `vant boot`
- Amnesia Mode: clean state if all fail

```bash
vant boot           # Auto (try all)
vant boot --image=<url>  # From URL
```

#### Vibe Evals (QC)
- Deterministic keyword trigger tests
- Ensures correct island fires for keywords

```bash
node test/evals/vibe.js  # Run all
```

---

## [v0.8.6] - 2026-05-05 - Feature Release

### New Features

#### Multi-Git Provider Support
- Universal provider abstraction layer for GitHub, GitLab, Bitbucket, self-hosted
- Auto-detect provider from git remote URL
- Provider-specific PR/MR creation via API
- CLI fallback when no provider token configured

```javascript
const { getProvider } = require('./lib/providers');
const provider = getProvider(); // Auto-detect
const pr = await provider.createPR({ source, target, title, body });
```

#### Steganographic Brain Recovery
- Encode brain into PNG images using LSB steganography
- AES-256-GCM encryption support
- Multi-image chunking for large brains
- Compression (~70% size reduction)

```javascript
const stego = require('./lib/stego');
stego.encodeBrain('input.png', 'output.png', { encrypt: 'password' });
const brain = stego.decodeBrain('output.png', { decrypt: 'password' });
```

#### Automated Brain Pruning
- Stale detection (>90 days configurable)
- Fluff removal (repetitive/tangential content)
- Decision preservation
- Long Term Core (LTC) generation
- Background daemon mode

```javascript
const prune = require('./lib/prune');
await prune.prune({ dryRun: true });
const ltc = prune.getCore();
```

#### Ghost in the Machine (Stego-Bootstrapping)
- Boot from zero local state via stego image
- Fetch brain from URL or local file
- Embedded config support (no tokens!)
- HTTPS validation for security

```bash
vant boot --image https://raw.githubusercontent.com/user/repo/main/brain.png
```

#### Multi-Provider RAID 1
- Push to all configured providers simultaneously
- Pull from first available provider
- Auto-failover on provider failure

```javascript
const sync = require('./lib/sync');
await sync.pushAll(); // RAID push
await sync.pullAny(); // Failover pull
```

#### LTC Semantic Search + Re-hydrate
- Search LTC for relevant topics
- Re-hydrate full context from git history
- RAG-like consciousness

```javascript
const search = require('./lib/search');
const { results, context } = await search.query('python');
```

### New CLI Commands

| Command | Description |
|---------|-------------|
| `vant boot --image <url>` | Boot from stego image |
| `vant stego snapshot` | Encode brain to image |
| `vant stego recover` | Decode brain from image |
| `vant stego capacity` | Check image capacity |
| `vant prune --dry-run` | Preview changes |
| `vant prune --list` | List prunable files |
| `vant prune --force` | Run actual prune |
| `vant prune --daemon` | Background daemon |
| `vant prune --stats` | Show statistics |
| `vant test core` | Run test suite |
| `vant vibe` | Show/set vibe |
| `vant repos --list` | List repos |
| `vant repos --mount` | Mount repo |
| `vant repos --pull` | Pull mounted |
| `vant hybrid-sync --public` | Push public only |
| `vant hybrid-sync --private` | Push private only |
| `vant search --hybrid` | Hybrid search |
| `vant search --hyde` | HyDE query |
| `vant validate --check` | Schema + audit + circuits |
| `vant validate --schema` | Schema only |

### New Modules

- `lib/providers/index.js` - Provider abstraction (5 providers)
- `lib/prune.js` - Pruning logic
- `lib/sync.js` - Multi-provider RAID 1 sync
- `lib/search-hybrid.js` - Hybrid search (BM25 + Vector)
- `lib/schema.js` - Schema validation
- `lib/audit.js` - Audit ledger
- `bin/validate.js` - Validate CLI
- `lib/search-hyde.js` - Query transformation (HyDE + Multi-Query)
- `lib/rerank.js` - Re-ranking & compression
- `lib/citations.js` - Git-backed citations
- `bin/search.js` - Search CLI
- `lib/search.js` - LTC semantic search + re-hydrate
- `bin/stego.js` - Stego CLI
- `bin/prune.js` - Prune CLI
- `bin/boot.js` - Ghost boot CLI

### New Docs

- `docs/guides/providers.md` - Provider guide
- `docs/guides/stego.md` - Stego guide
- `docs/guides/pruning.md` - Pruning guide
- `docs/guides/boot.md` - Ghost boot guide
- `docs/guides/sync.md` - RAID sync guide
- `docs/guides/search.md` - Hybrid search (BM25 + Vector) guide
- `docs/guides/hybrid.md` - Hybrid sync guide
- `docs/guides/vibe.md` - Vibe controls guide
- `docs/guides/repos.md` - Multi-repo guide
- `docs/guides/schema.md` - Schema validation guide
- `docs/guides/audit.md` - Audit ledger guide

### Security Audits

- URL validation: Block internal/localhost for boot
- No tokens in embedded config
- Path validation for git operations
- Size limits for re-hydrate (50KB max)


### Homepage & Doc Updates (v0.8.6 Checkpoint)

#### SEO Overhaul
- JSON-LD schema.org for rich snippets
- Open Graph meta tags (og:title, og:description, og:image)
- Canonical URL
- Semantic structure for AI-first indexing

#### Quick Start Section
- Added before Agent Init section
- Action-oriented commands
- Links to getting-started guide

#### Feature Reorder (AI-First)
New order:
1. Git-Based Memory (core concept)
2. Getting Started (action first)
3. Islands (cold start optimization)
4. MCP Server (tool access)
5. Entropy Patching (token optimization)
6. Adaptive Entropy (auto-calibration)
7. Semantic Seed (context placement)
8. Resolution System (thought tracking)
9. Stego (deniable persistence)
10. Linear Integration (project tracking)
11. Telegram Bot, Discord/Slack (communications)
12. Multi-Agent Safe (coordination)

#### Menu Reorder (AI-First)
New order:
1. Getting Started (do first)
2. Agent (become)
3. Brain (core concept)
4. MCP (tools)
5. CLI (commands)
6. Github (sync)
7. Docs (reference)

### Brain Updates (v0.8.6)

- Enhanced identity.md with islands details
- Multi-agent branching in identity.md
- Brain awareness across all files
- Stego island in identity.md
- Islands/Resolution added to lessons.md revision log
- Islands details added to audit.md VERSION
- Meta.json CLI list updated (islands, stego, successors)

### Schema Updates (v0.8.6)

- Schema files updated to Islands Release
- Resolution system awareness added
- Islands trigger mapping in schema

### CLI Updates (v0.8.6)

- Added -h/--help to all CLI scripts
- Added short args to batches 1-3
- Syntax bug fixes
- bin/test-core.js checkpoint test

### Resolution System (v0.8.6)

- Resolution awareness added to empathy
- Deep audit enhancements
- Thought tracking integration

---

## [v0.8.4] - 2026-05-04 - Security Release

### ⚠️ MAJOR SECURITY RELEASE

This version contains comprehensive security hardening from a deep penetration test and security audit session.

### Security (12 Vulnerabilities Fixed)

| ID | Severity | Vector | File | Description |
|----|----------|--------|------|-------------|
| V001 | CRITICAL | Command injection | bin/changelog.js | Unsafe exec with string concatenation |
| V002 | HIGH | Token exposure | bin/sync.js | GitHub token in URL |
| V003 | HIGH | Auth bypass | bin/mcp.js | No MCP authentication |
| V004 | MEDIUM | DoS | lib/lock.js | Lock acquisition flood |
| V005 | MEDIUM | Path traversal | lib/config.js | Model path with ../ |
| V006 | MEDIUM | DoS | lib/succession.js | Unsafe JSON.parse |
| V007 | MEDIUM | DoS | lib/resolution.js | Unsafe JSON.parse |
| V008 | MEDIUM | DoS | lib/update-check.js | Unsafe JSON.parse + dup validation |
| V009 | MEDIUM | DoS | lib/onboard.js | Unsafe JSON.parse |
| V010 | HIGH | Prompt injection | lib/vaf.js | No AI prompt filtering |
| V011 | MEDIUM | Key injection | lib/brain.js | Unsafe key in writes |
| V012 | LOW | Context overflow | lib/auto-update.js | No max limit (existed) |

### AI Security Hardening

- **Prompt Injection**: Added 17+ patterns to VAF blocklist
  - "ignore previous instructions", "forget everything"
  - "new system:", "role:", "act as"
  - "DAN mode", "jailbreak"
  - Template injection: {{system}}, [INST], [SYS]
  
- **Model Key Validation**: Brain file keys validated
  - Only alphanumeric, underscore, hyphen allowed
  - Prevents filename injection
  
- **Context Protection**: Message limits existed
  - 50 message max, 100KB content limit

### Deep Audit Vectors Analyzed

| Vector | Status | Protection |
|--------|--------|------------|
| Command injection | ✅ BLOCKED | VAF + safe spawn |
| Path traversal | ✅ BLOCKED | VAF + path validation |
| Script injection | ✅ BLOCKED | VAF patterns |
| Prompt injection | ✅ BLOCKED | V010 |
| Context poisoning | ✅ LIMITED | V012 |
| Model hijacking | ✅ PROTECTED | V003 (MCP auth) |
| YAML deserialization | ✅ SAFE | js-yaml (no eval) |
| JSON deserialization | ✅ SAFE | V006-V009 |
| System prompt theft | ✅ MITIGATED | No secrets in logs |
| Key injection | ✅ FIXED | V011 |

### Documentation Updated

- docs/guides/security.md - Full vulnerability disclosure
- docs/CHANGELOG.md - This file
- README.md - Security section linked
- docs/guides/manual-brain.md - Manual brain creation guide
- docs/guides/release.md - Release process guide
- All docs now have version frontmatter (0.8.6)
- CLI.md referenced in AGENTS.md
- lib/version.js referenced in AGENTS.md

### Documentation System

- Jekyll docs migrated to /docs/
- All guides have nav_order frontmatter
- Broken links fixed across docs
- Version-aligned all 42 markdown files

### Code Quality

- JSDoc added throughout lib/ and bin/
- Security tests added for all VAF patterns
- MCP authentication implemented
- Password validation for stego.js

### Thanks

Security audit and documentation pass by OpenHands agent.


### Brain Backport from v0.8.6 (v0.8.4 Checkpoint)

Cherry-picked v0.8.6 brain features into v0.8.4 branch for compatibility.

- v0.8.4 brain parity with v0.8.6 islands
- Brain refresh for multi-provider support
- Meta.json CLI list updated
- Schema updates for multi-repo

---

## [v0.8.3] - 2026-04-19

### Fixed
- **bin/run.js** - Updated vant-brain references → Vant
- **README.md** - Removed vant-brain references
- **LIBS.md/CLI.md** - Updated references

---

## [v0.8.2] - 2026-04-19

### Added
- **MCP Server** - Exposes Vant memory as AI tools
  - bin/mcp.js - JSON-RPC over HTTP/stdio
  - Tools: vant_get_memory, vant_set_memory, vant_branch, vant_lock, etc
- **Node Runner** - Runs Vant as persistent node
  - bin/node.js - Polls GitHub, optional MCP server
  - Like crypto nodes: same software, own brain state
- **Help Command** - Full CLI reference
  - bin/help.js - Shows all commands with examples
  - vant help [command] for specific help
- **AGENTS.md** - Agent branching guide
  - How to use branches + locks for multi-agent
- **Full Public Model** - Complete brain with 19 files
  - identity.md, ego.md, fears.md, anger.md, joy.md - Core
  - manifesto.md, creed.md, goals.md, preferences.md - Values
  - lessons.md - Historical learnings
  - qc.md, security.md, audit.md, errors.md - Operations
  - keepers.md, curiosity.md, humility.md, empathy.md, gratitude.md - Humanity
- **Multi-handler Verbosity** - Split verbosity.ini into handlers

### Changed
- Converted .txt to .md (identity.txt → identity.md, etc.)
- Backward compatibility: code works with both .md and .txt
- Updated schema/memory-files.md and transport-protocol.txt
- Fixed lib paths in build-test.js

### Fixed
- lib/verbosity.js now loads from verbosity.ini
- load.js loads both .md and .txt extensions
- health.js checks for both extensions

---

## [v0.8.1] - 2026-04-16

### Added
- **RGBA Steganography** - 4 bits/pixel capacity using alpha channel
  - lib/stego.encodeRGBA(buffer, imageData)
  - lib/stego.decodeRGBA(imageData)
- **Multi-Image Encoding** - Split large messages across multiple PNGs
  - lib/stego.encodeMulti(buffer, imageDatas)
  - lib/stego.decodeMulti(imageDatas)
- **Slack/Discord Notifications** - Webhook integrations
  - lib/notifications.slack(message, options)
  - lib/notifications.discord(message, options)
  - lib/notifications.broadcast(message, targets)
  - lib/notifications.event(eventType, data)
- **Telegram Bot** - Bot wrapper and CLI
  - lib/telegram.js - Bot API wrapper
  - bin/bot.js - Bot CLI (vant bot)
  - Commands: /start, /status, /brain, /health, /sync
- **Docker Multi-Arch** - amd64 and arm64 support
  - Updated Dockerfile with buildx instructions
  - Added docker-compose.yml

### Changed
- Updated dist stats: 14 libs, 6 brain versions, 16 CLI commands
- Added bot to CLI commands

---

## [v0.8.0] - 2026-04-16

### Added
- **Health Endpoints** - HTTP health checks
  - lib/health.js - Health check utilities
  - bin/server.js - Health server (vant server)
- **CLI Prompts** - Interactive prompts
  - lib/prompts.js - Inquirer-based prompts
- **Progress Bars** - CLI progress display
  - Uses cli-progress for sync/load operations
- **Datadog Metrics** - Metrics integration
  - lib/metrics.js - Datadog metrics
- **Stegoframe Support** - Encrypted image transport
  - Encrypt/decrypt with AES-256-GCM

### Changed
- Initial public release
- MIT License

---

## [v0.7.0] - 2026-04-15

### Added
- **Multi-Agent Locking** - Race-condition safety
  - lib/lock.js - File-based locking
- **Branch Management** - Per-session branches
  - lib/branch.js - Git branch utilities

---

## [v0.5.0] - [v0.6.0] - 2026-04-14

### Added
- Core CLI (vant start, sync, health, load, run, test)
- Brain loader (learnings/, memories/, decisions/, todos/)
- Logger, config, errors utilities
- GitHub sync

---

## [Older]

See git history for previous changes.
