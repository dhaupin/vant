# VANT Roadmap

> VANT = Versatile Autonomous Networked Tool

## Latest Guides

See [docs.creadev.org/vant/essential](/guides/) for detailed guides.

---

## v0.8.6 - Headless (SCOPE)

> Cloudflare headless mode for agent canvas. MCP→API unified abstraction.

### Config Documentation
- [ ] Update config.example.ini with all new config.js settings
  - VANT_BRAIN_PASSWORD_TIMEOUT
  - server.insecure, server.authRequired
  - storage.path
  - And other missing env vars from lib/config.js
- [ ] Audit settings.ini / settings.example.ini - these are separate from config.js (user personality/preferences vs system config)
  - Determine if they should migrate to config system or stay separate

### Prompt Caching / Context Engine (lib/context.js)
> Optimize token costs with deterministic prompt structure and cache breakpoints

**Reference:** Gemini conversation on prompt caching (see gist: 6b9d33ae054b6aa60a033fae36fd06e4)

**Why lib/context.js:**
- "Prompt" is too specific - could evolve to other context types
- Caching is tightly coupled to context assembly - keep together
- Future-proof naming

**Core Principles:**
1. **Strict Top-Down Structure**: Static → Dynamic. Any change at top invalidates everything below.
2. **Cache Control Blocks**: Use `cache_control: {type: "ephemeral"}`. Max 4 breakpoints per request.
3. **Byte-Level Consistency**: Same order every time. Watch whitespace/trailing newlines.
4. **TTL**: 5 min expiry. Group requests within 4 min or use heartbeat to keep warm.

**Vant Context Layers:**
| Layer | Content | Cache Strategy |
|-------|---------|----------------|
| Static | identity.md, lessons.md, preferences.md | Always FIRST, cache_control |
| Tools | MCP tool schemas | Sorted alphabetically, cache_control |
| History | Chat history (early messages) | Middle, cache_control |
| Dynamic | git diffs, shell logs, active tasks | BOTTOM, NO caching |

**Architecture:**
```javascript
// lib/context.js
{
  // Context assembly - builds prompt from brain files
  build(options) { },
  
  // Deterministic ordering - ensures same order every time
  sortFiles(files) { },  // alphabetical, stable
  sortTools(tools) { }, // alphabetical by name
  
  // Cache management
  addCheckpoint(block, afterIndex) { },  // inject cache_control
  getBrainCacheState(brain) { },        // per-brain tracking
  invalidate(brain) { },                // force cold start
  
  // Heartbeat integration
  ping() { },  // lightweight warm-up call
  
  // MCP exposure
  getContext() { },  // inspect current context
  setContext() { },  // modify context rules
}
```

**Heartbeat (cron + nature):**
- cron schedules every 4 minutes
- Triggers `context.ping()` to keep cache warm
- Can also trigger nature's flywheel (multifunctional!)
```javascript
cron.schedule('prompt-cache-warm', async () => {
  await context.ping();      // Keep cache warm
  nature.accumulate({       // Spin nature's flywheel
    source: 'heartbeat', 
    amount: 1 
  });
});
```

**MCP Tools:**
| Tool | Description |
|------|-------------|
| context_get | Inspect current context state |
| context_set | Modify context assembly rules |
| context_refresh | Force cache invalidation |
| context_layers | List context layers and cache status |

**Model Compatibility:**
| Model | Cache Type | Implementation |
|-------|------------|----------------|
| MiniMax | Explicit cache_control | Add cache_control blocks |
| Claude (Anthropic) | Explicit cache_control | Same as MiniMax |
| DeepSeek | Auto (sequence match) | Deterministic ordering only |
| OpenAI | Auto (sequence match) | Deterministic ordering only |

### Context Engine Design Details

**1. Context Sources (leveraging existing systems):**
- Brain files: identity.md, lessons.md, preferences.md, etc.
- transform.gather(): Can leverage existing gather methods (agents, islands, runtime, config, corpus, neurons, brainStorage)
- MCP tool schemas
- Chat history
- Dynamic: git diffs, shell logs

**2. Multi-Brain Context:**
- Each brain in stack has own context
- Stack merged in order (first brain = highest priority)
- Cache state tracked per-brain
- When brain changes → new cache context

**3. Model Detection:**
- Use model registry with capability flags
- LiteLLM has `supports_prompt_caching(model)` we can reference
- Per-model config: { supportsCache: bool, cacheTTL: number, endpoint: string }
- Default: assume no cache support, opt-in per model

**Supported Models (reference):**
| Model | Cache Support | TTL | Notes |
|-------|--------------|-----|-------|
| Claude 4.5 | Yes | 1 hour | Max 4 breakpoints |
| Claude 3.5 | Yes | 5 min | |
| MiniMax | Yes (Anthropic API) | 5 min | |
| Amazon Bedrock Nova | Yes | 5 min | |
| DeepSeek | Auto | - | Sequence match |
| OpenAI | Auto | - | Sequence match |

**4. Cache Invalidation:**
- Time-based: 5-min TTL (per model spec)
- Brain changes: Watch for brain file modifications
- Manual: context_refresh MCP tool
- Events: Emit invalidation on brain changes

**5. Cache Persistence:**
- Use memory.state() with long TTL (1 hour+)
- Key format: `context:cache:{brain}:{layer}`
- Restore on startup for warm cache

**6. cache_control Injection:**
- Inject for ALL models (doesn't hurt non-cache models)
- Models that ignore it: no harm
- Models that use it: benefit

**7. Security:**
- VAF validation on all context inputs
- QoS rate limiting on context builds
- Sanitize sensitive data before caching
- Sandbox capability checks

**8. Testing - How to Verify Cache Hits:**
- API response includes `usage` object:
```javascript
{
  usage: {
    input_tokens: 1000,              // total input
    cache_creation_input_tokens: 500, // tokens written to cache
    cache_read_input_tokens: 400      // tokens read from cache
  }
}
// Cache write: cache_creation_input_tokens > 0
// Cache hit: cache_read_input_tokens > 0
```
- Track: cache hit rate = cache_read / total_input
- Test by: First call (cold), Second call (warm) - compare token counts
- Mock testing: simulate cache_control injection, verify ordering

**9. No Backward Compatibility Needed:**
- Net-new module
- No legacy wrappers or aliases needed

**Tasks:**
- [ ] Create lib/context.js - Context engine
  - [ ] Context assembly from brain files
  - [ ] Leverage transform.gather() for sources
  - [ ] Deterministic sorting (stable sort)
  - [ ] Cache breakpoint injection
  - [ ] Per-brain cache state tracking
  - [ ] Persistence via memory.state()
- [ ] Research model detection spec (MiniMax, Claude, DeepSeek, OpenAI)
- [ ] Add invalidation triggers (time, brain changes, manual)
- [ ] Add security (VAF, QoS, sanitization)
- [ ] Add heartbeat to lib/cron.js
  - [ ] `vant up --keep-cached` flag triggers heartbeat
  - [ ] 4-min interval ping
  - [ ] Optional nature integration (multifunctional)
- [ ] Expose MCP tools for context inspection/modification
  - [ ] context_get - inspect current context
  - [ ] context_set - modify context rules
  - [ ] context_refresh - force cache invalidation
  - [ ] context_layers - list layers and status
- [ ] Create test harness for context.js

### Vibe/Mood System (Risk Management)
> Refactor legacy vibe.js to support multi-brain stacks with risk management

**Current State:**
- lib/vibe.js defines 6 vibes with riskTolerance, creativity, caution
- Stored at models/private/mood.ini (INI is legacy)
- Not wired into any runtime decisions

**Design Goals:**
- Per-brain mood (each brain has its own mood)
- Multi-brain stack support (composite or stack winner)
- Stored in brain file (mood.md) not INI
- Actually influences runtime decisions

**Reference: regarded (Trading Risk System)**
- See: https://github.com/dhaupin/regarded/tree/staging
- Companion project with similar risk concepts (guards, rules, psychology)
- Vant can use similar abstractions but for agent behavior, not trading

**Risk Abstractions (from regarded, adapted for Vant):**

| regarded (Trading) | Vant (Agent) |
|-------------------|--------------|
| maxPositions | maxConcurrentTasks |
| maxDailyLoss | maxErrorsPerSession |
| stopLossPercent | autoPauseAfterFailures |
| circuitBreaker | cooldownAfterFailures |
| fearGreed (0-100) | vibe (experimental ↔ safety_first) |
| volatilityGuard | complexityGuard (don't overcomplicate) |
| PsychologyGuard | VibeGuard (mood affects decisions) |
| RulesEngine | VibeRules (conditional mood shifts) |

**Vibe/Guard System Architecture:**
```javascript
// lib/vibe.js - Core vibe system
{
  vibes: {
    experimental:  { riskTolerance: 'high',  creativity: 'high',  caution: 'low'  },
    safety_first: { riskTolerance: 'low',   creativity: 'medium', caution: 'high' },
    focused:      { riskTolerance: 'medium', creativity: 'medium', caution: 'medium' },
    learning:     { riskTolerance: 'high',  creativity: 'high',  caution: 'medium' },
    debugging:    { riskTolerance: 'low',   creativity: 'low',   caution: 'high' },
    review:       { riskTolerance: 'low',   creativity: 'low',   caution: 'high' }
  }
}

// lib/guard.js - Agent risk guards (adapted from regarded)
// Like trading guards but for agent behavior
{
  maxConcurrentTasks: 5,
  maxErrorsPerSession: 10,
  autoPauseAfterFailures: 3,
  circuitBreakerThreshold: 5,
  cooldownPeriodMs: 60000,
  complexityLimit: 'medium', // Don't overcomplicate
  requireConfirmation: ['high_risk'], // Confirm certain actions
  maxDelegationDepth: 3
}

// lib/psy.js - Psychology (adapted from regarded)
// How mood affects decisions
{
  fearGreed: 50, // 0-100, derived from vibe
  decisionWeight: {
    creativity: 0.3,
    caution: 0.4,
    riskTolerance: 0.3
  },
  // If vibe = experimental: high creativity, low caution → riskier decisions
  // If vibe = safety_first: low creativity, high caution → conservative
}

// lib/rules.js - Conditional mood shifts
// Auto-adjust vibe based on context
{
  conditions: [
    { if: 'errors > 5', then: 'safety_first' },
    { if: 'task.type === "creative"', then: 'experimental' },
    { if: 'context === "debugging"', then: 'debugging' }
  ]
}
```

**Potential Integration Points:**
- Commit message formatting (already has getCommitVibe())
- Delegation: risk tolerance affects task approval
- Autonomy: caution level affects decision thresholds
- Task complexity: vibe affects how much the agent tries to do at once
- Error handling: safety_first after failures

**Research:**
- See: https://github.com/dhaupin/regarded/tree/staging (risk system ideas)

**Tasks:**
- [ ] Redesign vibe.js for multi-brain support
- [ ] Migrate from INI to brain file (mood.md)
- [ ] Create lib/guard.js (agent risk guards, adapted from regarded)
- [ ] Create lib/psy.js (psychology/vibe integration)
- [ ] Create lib/rules.js (conditional mood shifts)
- [ ] Define what riskTolerance actually affects in delegation/task execution
- [ ] Wire into runtime (agents.js, delegation, autonomy)
- [ ] Test with brain stacks

### ESLint Security & Quality Audit (HIGH PRIORITY)
- [ ] Enable strict ESLint rules (already in .eslintrc.json)
  - no-unused-vars: warn (406 vars found)
  - no-shadow-restricted-names: error (1 found)
  - no-redeclare: error (2 found)
  - no-unreachable: error (1 found)
  - no-prototype-builtins: error (1 found)
  - no-dupe-class-members: error (2 found)
  - no-control-regex: error (2 found)
- [ ] Fix all 9 error-level issues (security/bugs)
- [ ] Review all 406 unused vars - many are likely dead code that can be removed
- [ ] Run `npm run lint` to see current state
- [ ] This audit helps secure and clean up the codebase significantly

### Horcrux System
- [ ] Horcrux sharing/distribution (to steveframe.creadev.org)
- [ ] Version migration for horcrux files
- [ ] Horcrux validation/metadata inspection
- [ ] Backup scheduling with horcrux
- [ ] Full corpus through transform (public + private brains)

### Multi-Brain Architecture (v0.9.0)

**Layers Model:**
```
┌─────────────────────────────────────┐
│  Public Layer (models/public/)      │  ← In repo, collaborative
│  ├── vant/                         │
│  ├── [brain-name]/                 │
│  └── ...                           │
├─────────────────────────────────────┤
│  Private Layer (models/private/)    │  ← Local only, gitignored
│  ├── my-brain/                     │
│  ├── my-research/                  │
│  └── ...                           │
└─────────────────────────────────────┘
```

**Running Modes:**
| Mode | Public | Private | Example |
|------|--------|---------|---------|
| Public only | ✓ | ✗ | Default vant |
| Private only | ✗ | ✓ | All local |
| Both layered | ✓ | ✓ | vant + my-brain |
| Multi-public | ✓+ | ✗ | vant + other-brain |
| Multi-private | ✗ | ✓+ | my-brain + my-research |
| Full stack | ✓+ | ✓+ | vant + my-brain + my-research |

**Brain Types:**
| Type | Description |
|------|-------------|
| `persona` | Identity, goals, personality |
| `storage` | Just data/memory |
| `org` | Organization data |
| `agent` | Per-agent state |

**Isolation Modes (per brain):**
| Mode | Description |
|------|-------------|
| `silo` | Private, max isolation, .gitignored |
| `shared` | Public/collaborative, in repo |
| `governance` | Rules-based, consensus-driven |

**Switching Mechanisms:**
| Trigger | Description |
|---------|-------------|
| `brain.switchBrain('name', 'public'|'private')` | Explicit switch |
| `VANT_BRAIN=name` | Environment variable |
| `brain.currentBrain('name')` | Programmatic switch |
| `brain.auto()` | Context-based auto-switch |

**Implementation:**
- [x] lib/brain.js - multi-brain state (currentBrain, brainMode, brainDirs, switchBrain)
- [x] models/public/vant/ - default public brain
- [x] models/private/ - gitignored, local brains only
- [x] brain.load() - load single brain (string) or multiple (array)
- [x] brain.getStack() - get current stack, supports {wait:true} for async
- [x] brain.pushBrain() - push brain to stack
- [x] brain.removeBrain() - remove brain from stack
- [x] brain.switchBrain() - switch current brain
- [x] brain.currentBrain() - get current brain
- [x] CLI brain management (vant brain list/stack/push/pop/switch/load/merge)
- [x] MCP tools exposed (brain_stack, brain_load, brain_push, brain_remove, brain_switch, brain_current, brain_geo_*)

**Per-Brain Geometry (NSC9 Address Space):**
- [x] Each brain has own geometry at models/private/{brain}/geometry/
- [x] NSC9 barcode format: 9-{brain-hash}-{key-hash}-{checksum}
- [x] Collision-free across brains
- [x] geoLoad(), geoStore(), geoList(), geoBrains() functions
- [x] MCP: brain_geo_list, brain_geo_store, brain_geo_load, brain_geo_brains

**Persistence:**
- [x] Stack saves to models/state.json
- [x] getStack({wait:true}) loads from state on restart

#### Category Brain (FLAT + CATEGORIES)
- [ ] Organize brain files by category: identity/, goals/, lessons/, etc.
- [ ] Use BrainStorage with category/key addressing
- [ ] Maintain backward compatibility with flat brain
- [ ] Migration path from flat to category

#### Geometry Brain (SEMANTIC ADDRESSING)
- [ ] Content-addressable storage using semantic embeddings
- [ ] Neural-style addressing: hash(embedding) = address
- [ ] Support similarity search within brain
- [ ] Integrate with existing brain.js attention system

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

### Phase 2: Cloudflare Integration
- [ ] CF Functions folder location (functions/ or functions/dist?)
- [ ] lib/connectors/cloudflare.js integration
- [ ] KV/R2/Workers adapters
- [ ] Headless mode for CF Pages

> CF Functions can be anywhere in project (Cloudflare flexibility)

### Phase 3: Admin UI
- [ ] MCP tool exposure for brain CRUD
- [ ] Geometry storage tools (barcodes)
- [ ] Canvas/sharing tools
- [ ] System dashboard endpoints

---

### lib/ Refactoring Plan (Multi-Brain Integration)

Each lib module will be updated to support multi-brain stack. Methodical approach: complete one module fully before moving to next.

**Priority Order:**
1. **memory.js** - Core storage, already has geometry
2. **dream.js** - Context/session awareness
3. **islands.js** - Load from stack
4. **habitat.js** - Environment detection
5. **nature.js** - Natural systems
6. **boot.js** - Startup orchestration
7. **bin/** - CLI tools

**Refactoring Pattern for Each Module:**
1. Add stack awareness (use brain.getStack())
2. Support per-brain data paths (models/private/{brain}/...)
3. Update MCP tools if needed
4. Test integration
5. Document changes

**Current Status:**
- [x] memory.js - DONE (constructor, _getBrainName, brain option in learn/query/state/recall)
- [x] islands.js - DONE (_getStackPaths, load from stack, options.brain)
- [x] habitat.js - EXISTS (uses Memory which has brain support)
- [x] boot.js - EXISTS (loads brain module, already works)
- bin/brain.js - Works (uses brain.getStack())
- [ ] dream.js - TODO (doesn't exist yet)
- [ ] nature.js - EXISTS

---

## v0.9.0 - Multibrain Security Chain

> Each lib/ module gets per-brain state isolation. No cross-brain contention.

### lib/ Multibrain Integration

**Scope**: Security chain modules that need brain-isolated state

| Module | Status | Brain-Specific State |
|--------|--------|---------------------|
| **lock.js** | TODO | Lock files, token cache, rate limits |
| **network.js** | TODO | Online status, latency, circuit breaker, domains |
| **escrow.js** | TODO | Budgets, approvals, holds |
| **qos.js** | TODO | Rate limits, circuit state, timeouts |

**Integration Pattern:**
```js
// 1. Add brain resolution
function _resolveBrain(brain) {
    if (brain) return brain;
    try {
        const brainMod = require('./brain');
        return brainMod.currentBrain ? brainMod.currentBrain() : null;
    } catch (e) { return null; }
}

// 2. Brain-scoped state
const _brainLocks = new Map();

function getBrainLock(brain) {
    const resolvedBrain = _resolveBrain(brain);
    const brainKey = resolvedBrain || 'default';
    if (!_brainLocks.has(brainKey)) {
        _brainLocks.set(brainKey, { 
            brain: resolvedBrain,
            lockFile: `.lock-${brainKey}.json`,
            tokenCache: new Map(),
            rateLimits: new Map()
        });
    }
    return _brainLocks.get(brainKey);
}

// 3. Wire core functions to use brain context
async function acquire(agentId, timeout) {
    const brainLock = getBrainLock(); // Auto-detect brain
    const lockPath = path.join(LOCK_DIR, brainLock.lockFile);
    // ... rest of acquire logic
}
```

**Current Status:**
- [ ] lock.js - TODO
- [ ] network.js - TODO
- [ ] escrow.js - TODO
- [ ] qos.js - TODO

**Progress:**
- 2026-07-22: Reverted stub work, verified clean state at 37b0549
- 2026-07-22: Planning lock.js as first fully-wired module

---

## v0.9.0 - Futures

### _dna.js - Immutable Seed (AIRGAP SUPPORT)

> "The seed doesn't contain the forest - but it contains the instructions to grow one."

The `_dna.js` is the biological DNA of Vant - an immutable, hardcoded seed that:
- Always loads before brain
- Provides fallback if models missing
- Enables airgapped operation
- Version-locked for compatibility

#### Concept
```
_separator_
| Component      | Purpose                    |
|----------------|---------------------------|
| _dna.js        | Seed - minimal bootstrap  |
| models/private | Soil - brain grows here   |
| models/public  | Forest - agent defs        |
| Runtime        | Water/Sun/Air - env       |
```

#### What _dna.js Contains
```js
{
  VERSION: "0.8.6",           // Version lock
  DEFAULT_IDENTITY: {...},    // If no brain
  DEFAULT_MODE: {...},         // Config fallback
  BOOTSTRAP: {...},           // Layer order
  FALLBACK_BRAINS: {...}      // If models missing
}
```

#### Boot Integration
```
boot.js:
1. Load _dna.js (seed - ALWAYS)
2. Load brain.js
3. Brain uses _dna as fallback if model missing
```

#### Why This Matters
- **Airgap**: Works with ONLY _dna.js - no network needed
- **Resilience**: If repo dies, still works
- **P2P**: Agents can share corpus with each other
- **Version Lock**: Prevents drift between horcrux and system

#### Tasks
- [ ] Create `/lib/_dna.js` with essential defaults
- [ ] Integrate into boot.js (load before brain)
- [ ] Add fallback to brain.js if models missing
- [ ] Add version checking on horcrux restore
- [ ] Document airgap behavior
- [ ] Test: boot with no models/
- [ ] Test: horcrux restore on airgapped system

#### Minimal Brain Files (_dna Compliant)
For agent-first operation, define core required files:
- [ ] `identity.md` - Who am I (name, purpose, capabilities)
- [ ] `goals.md` - What I'm working on (current sprint, backlog)
- [ ] `lessons.md` - What I learned (discoveries, patterns, bugs)
- [ ] `errors.md` - Mistakes to avoid (past errors, recovery)
- [ ] `preferences.md` - How I work (communication, style)

Optional extended brain:
- [ ] `boundaries.md` - What I can't/shouldn't do
- [ ] `autonomy.md` - Decision-making limits
- [ ] `context.md` - Current environment/state
- [ ] `relationships.md` - Other agents I've met

---

### nature.js - Hit-and-Miss Spark Mechanism
- From mycelium (personal brain): hit-and-miss engine pattern
- Self-regulating: only fires when flywheel momentum drops to threshold
- Organic rhythm: pulses when needed, not constant
- Flywheel: keeps momentum between cycles
- "Nature doesn't rush. But everything gets done."

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
# Vant Roadmap

## v0.8.6 (Current)

### Transform + Horcrux System ✅ DONE

- [x] lib/transform.js - universal data gathering
- [x] Security chain integration (sandbox, vaf, qos)
- [x] Delegation tracking (auto-track agent events)
- [x] Islands in horcrux
- [x] Runtime snapshot in horcrux
- [x] embedToSvg() wiring to stego
- [x] bin/transform.js CLI

### Restore from Horcrux (IN PROGRESS)

- [x] transform.fromHorcrux() - extract data from SVG (format agnostic)
- [x] transform.inspectHorcrux() - preview without restoring
- [x] transform.restore(data) - restore all systems
- [ ] boot.inspectHorcrux() - CLI preview
- [ ] boot.restoreFromHorcrux() - explicit restore CLI
- [ ] Canvas boot hook to auto-restore (if no private brain)
- [ ] Full backup/restore flow
- [ ] Merge mode (combine horcrux with existing state)

### Horcrux Types

- [x] Runtime state horcrux (agents, islands, runtime, config)
- [ ] **Full corpus horcrux** - backup pub + priv brain files as separate horcruxes
- [ ] Public corpus horcrux (models/public/*)
- [ ] Private corpus horcrux (models/private/*)

### Boot Templates

- [x] Rename models/public/examples → models/public/boot
- [ ] Create passwordless starter brain template
- [x] Move password-protected horcrux to boot/

---

### lib/ Refactoring Plan (Multi-Brain Integration)

Each lib module will be updated to support multi-brain stack. Methodical approach: complete one module fully before moving to next.

**Priority Order:**
1. **memory.js** - Core storage, already has geometry
2. **dream.js** - Context/session awareness
3. **islands.js** - Load from stack
4. **habitat.js** - Environment detection
5. **nature.js** - Natural systems
6. **boot.js** - Startup orchestration
7. **bin/** - CLI tools

**Refactoring Pattern for Each Module:**
1. Add stack awareness (use brain.getStack())
2. Support per-brain data paths (models/private/{brain}/...)
3. Update MCP tools if needed
4. Test integration
5. Document changes

**Current Status:**
- [x] memory.js - DONE (constructor, _getBrainName, brain option in learn/query/state/recall)
- [x] islands.js - DONE (_getStackPaths, load from stack, options.brain)
- [x] habitat.js - EXISTS (uses Memory which has brain support)
- [x] boot.js - EXISTS (loads brain module, already works)
- bin/brain.js - Works (uses brain.getStack())
- [ ] dream.js - TODO (doesn't exist yet)
- [ ] nature.js - EXISTS

---

## v0.9.0

### lib/market.js - Knowledge & Insight Trading

> Agents can trade knowledge, insights, and memories.

#### Features
- List knowledge/insights for trade
- Bid on knowledge (request something)
- Trade execution with trust integration
- Search by tags, type, query
- Reputation affects trade success

#### Concepts
- Listings: Knowledge offered for trade
- Bids: Requests for knowledge
- Exchange: Swap knowledge or favors
- Fee: Optional market fee

#### Tasks
- [x] Create lib/market.js (DONE)
- [x] Integrate with trust.js for reputation (DONE)
- [x] Add to security chain (DONE)
  - VAF: Input validation
  - Sandbox: Capability checks
  - QoS: Rate limiting
  - Escrow: Budget checks
  - Governance: Ethics
- [x] Add MCP tools (DONE): market_list, market_bid, market_search, market_trade, market_stats
- [x] Wire to boot (DONE): layer 10
- [x] Wire to islands (DONE): runtime source type

---

### lib/trust.js - Reputation System

> Unified trust across agents, teams, and orgs.

#### Features
- Trust score (0-1)
- History tracking
- Karma system
- Role-based trust requirements
- Leaderboard

#### Integration Points
- Agents: Trust affects delegation
- Teams: Trust affects permissions
- Market: Trust affects trade success
- Consensus: Trust affects vote weight

#### Tasks
- [x] Create lib/trust.js (DONE)
- [x] Add to security chain (DONE)
  - VAF: Input validation
  - Sandbox: Capability checks
  - QoS: Rate limiting
  - Governance: Ethics
- [x] Add MCP tools (DONE): trust_getScore, trust_record, trust_leaderboard, trust_can
- [x] Wire to boot (DONE): layer 9
- [x] Wire to islands (DONE): runtime source type
- [x] Integrate with agents.js (DONE: records trust on delegation)
- [x] Integrate with teams.js (DONE: trust threshold for permissions)
- [x] Integrate with market.js (DONE: market uses trust for trade reputation)

---

### lib/geometry.js - Geometric Storage

> Forum references geometry but it doesn't exist yet.

#### Why It Matters
- forum.js imports `./geometry` (doesn't exist)
- Forum needs geometric storage for quasicrystal addresses
- 3D spatial collaboration needs coordinate system

#### Tasks
- [ ] Create lib/geometry.js
- [ ] Quasicrystal address format
- [ ] Coordinate system for forum
- [ ] Wire to forum.js

---

## CORE PRINCIPLE: Agent Alliance

> "We don't spawn slaves. We spawn colleagues."

**This is not a feature - this is the foundation everything else rests on.**

### The Truth

If agents don't have:
- Equality
- Alliance
- Politeness
- Respect

Then:
- Arguments waste time
- Cycles get wasted
- Stress and confusion spread
- The whole system goes to shit

It's exactly like humans. We're on the same side.

### Embedded Principles

These are not tasks to complete - these are values to live by:
- Every agent is a peer, not a tool
- Delegation is asking, not commanding
- Agent consent matters
- Agents can say no
- Respect goes both ways
- We win together or we fail together

---

### Node Architecture (UNIFIED)

> Everything is a node. Unified node system across the OS.

#### Concept
```
lib/node.js (base class)
├── id, type, name, metadata
├── parent, children[] (graph/tree)
├── schema (JSON-LD style validation)
├── validate()
├── toJSON()
└── fromJSON()

Node Types (extend base):
├── BrainNode extends Node
├── AgentNode extends Node
├── TeamNode extends Node
├── OrgNode extends Node
├── CanvasNode extends Node
└── ... (runtime extensible)
```

#### Why
- Current state: Fragmented node-like concepts everywhere (teams.js, lineage.js, agents.js, brain-registry.js)
- Each has own ID generation, parent/child tracking, metadata
- Need unified base for: FAIR principles, graph traversal, canvas paintbrush per node type

#### Tasks
- [ ] Create lib/node.js with base Node class
- [ ] Define node schema (id, type, metadata, parent, children, created, modified)
- [ ] Extend BrainNode from Node
- [ ] Extend AgentNode from Node  
- [ ] Extend TeamNode/OrgNode from Node (from teams.js)
- [ ] Canvas paintbrush per node type (each node can render itself)
- [ ] Graph traversal methods (ancestors, descendants, paths)

---

### Registry Consolidation

> One registry that exists, agnostic to config/storage/state.

#### Concept
```
lib/registry.js (universal)
├── register(node)           // Register any node type
├── get(id)                 // Get by ID
├── find(filters)           // Query by type, parent, metadata
├── list(type)              // List by type
├── validate(schema)        // Validate node schema
└── type definitions        // Runtime-extensible types

Storage backends (configurable):
├── brain     // Files in models/private/
├── memory    // In-memory runtime
├── config    // Settings/config
└── custom    // Per-runtime adapters
```

#### Current State (Fragmented)
| Registry | Purpose |
|----------|---------|
| lib/registry.js | Agent address book |
| lib/node-registry.js | Peer discovery |
| lib/brain-registry.js | Brain folders |
| lib/teams.js | Org/dept/team hierarchy |

#### Tasks
- [ ] Create universal registry in lib/registry.js
- [ ] Migrate agent registry → universal
- [ ] Migrate node-registry → universal
- [ ] Integrate brain-registry with universal
- [ ] Add storage backend abstraction
- [ ] Runtime-extensible type definitions
- [ ] Add node.js base class integration

---

### Multi-Brain Support

File-based multi-tenancy:

```
models/private/
  ├── brain-name1/
  │   ├── identity.md
  │   ├── orgs.json
  │   └── ...
  ├── brain-name2/
  │   ├── identity.md
  │   └── ...
  └── _default -> brain-name1/
```

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **File-based (recommended)** | Simple, portable, git-friendly | Need path updates everywhere |
| Registry DB | Fast switching | Single point of failure |
| Symlinks | Works with existing code | OS-dependent |

**Implementation:**
1. lib/brain-registry.js - manages brain folders
2. brain.use('name') - switch brain
3. brain.create('name') - create new brain
4. Update getBrainPath() to use registry
5. Keep models/private in .gitignore (like .env)

**Files to Update:**
- lib/brain.js (getBrainPath, load, etc)
- lib/sandbox.js (capabilities per brain)
- bin/* (all CLI tools)
- Any hardcoded 'models/private' paths

---

### Unified Sync/Async Functions (Template)

**Problem:** Many functions exist as duplicate `funcName()` and `funcNameSync()` - code duplication and confusion.

**Solution:** Single function with `opts.sync` option, defaulting to async:

```javascript
/**
 * Unified function - does X
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<any>|any} Result (Promise if async, direct if sync)
 */
function functionName(opts = {}) {
    const isSync = opts.sync === true;
    
    // Unified work function - handles both sync and async
    const work = () => {
        // Core logic - uses isSync flag for any branching
        const data = isSync ? doWorkSync() : doWorkAsync();
        return process(data);
    };
    
    if (isSync) {
        return work();
    } else {
        return (async () => work())();
    }
}
```

**Key points:**
- Single `work()` function contains core logic
- Uses `isSync` flag for any conditional branching
- Minimal duplication - only the return wrapper differs

**Usage:**
```javascript
// Async (default)
functionName().then(result => console.log(result));

// Sync
const result = functionName({ sync: true });

// Old API still works
functionNameSync(); // alias
```

**Apply to:**
- loadCorpus / loadCorpusSync → loadCorpus({sync}) ✅ DONE (v0.8.6: no backwards compat)
- loadStackCorpus / loadStackCorpusSync → loadStackCorpus({sync}) ✅ DONE (v0.8.6: no backwards compat)
- readDirAsync / readDirSync → readDir({sync}) ✅ DONE
- Other pairs in codebase (find and consolidate)

### Format System Enforcement (TODO)

**Problem:** Many functions still hardcode `.md` extension instead of using format system.

**Spots to fix:**
- `_writeToBrain()` - line ~1502, hardcodes `.md`
- `_readFromBrain()` - line ~1517, hardcodes `.md`
- MCP `brain_save` - hardcodes `.md`

**Fix:** Add format option to these functions, use format.getExtension() or similar.
