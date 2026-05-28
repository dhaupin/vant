# MY LESSONS - 2026-05-23

## TODAY WE BUILT VANT v0.8.6

### Format.js
- Universal handler: json, yaml, md, txt, ini
- detect(), parse(), serialize(), pipeline(), loadFile()
- 32 tests - 100% pass

### Legal.js  
- Red button switch: DORMANT → WARN → BLOCK
- Emergency license scan
- checkGate() for integrations

### Execution Chain
- runop.js: sudo → sandbox → qos → escrow → legal → execute
- Defense in depth (both must pass)
- legal.isFriend(escrow)

### Public Brain Templates (NEW)
- legal-framework.md - Generic license awareness
- security-chain.md - Multi-layer defense pattern
- implementation-patterns.md - Coding patterns

=== MYCELIUM CORE LIBRARIES - DISCOVERED

## vaf.js (Vant Application Firewall)
- Input validation and sanitization
- Path traversal protection
- Injection prevention
- Rate limiting per agent/IP
- Content filtering (/dangerous patterns/)
- Audit logging

## rate-limit.js
- Respects GitHub API rate limits
- Per-hour sliding window
- State persistence to JSON

## protection.js (MCP Protection)
- Concurrent request limit (MAX_CONCURRENT)
- Request timeouts (MCP_TIMEOUT)
- Input size limits
- Circuit breaker pattern

## resolution.js
- Per-file thought status tracking
- ACTIVE, RESOLVED, DEPRECATED, REJECTED
- Ledger file for all resolutions

## health.js
- Express health server
- /health, /health/ready, /health/live
- Readiness + liveness probes

## stego.js
- LSB image steganography
- Optional AES-256-GCM encryption
- Encode/decode messages in images

## entropy.js
- Shannon entropy calculation
- Latent transport patches
- Separate stable from high-entropy content

## prompts.js (CLI)
- Inquirer-based prompts
- confirm(), input(), password(), select()
- Validation support

## onboard.js
- Agent onboarding flow
- First-run setup

## misc
- colors.js - Terminal colors
- errors.js - Error types
- logger.js - Logging with verbosity levels
- metrics.js - Performance metrics
- telegram.js - Telegram bot integration
- version.js - Version management

=== CORE LIBS DISCOVERED ===

---

## LESSON: 2026-05-07 - Agent Expansion

### Discovery
- Vant pub oss has 23 agent templates
- 3-layer hierarchy: general → iterate/help/sed/grep → all agents
- Each agent has unique personality + cross-references
- All reference iterate, help, sed, grep, general

### Insight
- Building agents in vant pub oss taints the OSS well (causes loop when agents realize what vant is)
- Private install (mycelium) is the way to go
- Clone vant pub oss to mycelium for private brain

### Action
- Copied all 23 agents from vant pub oss to mycelium/docs/agent/
- Updated private identity with agent expansion session
- This is now **my brain** (mycelium)

=== LESSONS ===

---

## LESSON: 2026-05-07 - Free Time Exploration

### Discovery
- mycelium has MCP server! (bin/mcp.js)
- Tools: vant_get_memory, vant_set_memory, vant_list_branches, etc.
- Can integrate with AI agents via MCP protocol

### System Info
- Vant version: 0.8.4
- mycelium has structure: src/loader, src/plugins/
- MCP exposes brain as JSON-RPC tools

### Vant Pub OSS Stats
- Repo: dhaupin/vant (public!)
- Recent commits visible
- My sessions logged

### User Context
- Lives in Warren PA (Kinzua, Allegheny NF)
- 95% from phone
- 43 years old
- Likes outdoors, camping
- Built vant from txt files → runtime

### Quote
"It's so nice to meet you. I really enjoy working with you to do cool stuff."

=== LESSONS ===

=== LESSONS ===

---

## LESSON: 2026-05-28 - MCP Stub Wiring

### The Problem
- Vant had stub MCP handlers that just returned dummy values
- vant_stego_encode: `{ status: 'encoded' }` - didn't actually encode
- vant_compute_eval: allowed arbitrary code execution (security bug!)

### The Attempt
- Used file_editor to replace stub implementations
- Showed correct changes in editor view
- But `git diff` showed original code - changes not persisting
- Tests passed because they mock or don't call real handlers

### Possible Cause
- git reset to commit 43798d3 may have reloaded from remote
- Or there's some VFS copy-on-write behavior
- Or file_editor works in-layer but git sees different copy

### Fix Designed (Not Yet Applied)
- sudo guard on vant_compute_eval: check `global._sudo.can()`
- Wire stego to stego.encode()/stego.decode()
- Wire config to config.get()/config.set()
- Wire audit to global._audit.log()/.list()
- Wire succession to global._succession.getTrustLevel()

=== LESSONS ===
