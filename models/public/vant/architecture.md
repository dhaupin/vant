# Lib Crawl - Full Module Inventory

> Updated: 2026-07-13

## Core Runtime
| Module | Purpose |
|--------|---------|
| `vant.js` | Main runtime - AI-first agent execution |
| `boot.js` | Core boot system - layer initialization |
| `runop.js` | Runtime operator - lifecycle management |
| `server.js` | HTTP/HTTPS wrapper with TLS + security |

## Security Stack
| Module | Purpose |
|--------|---------|
| `vaf.js` | Input validation, filtering, rate limiting |
| `auth.js` | API key validation, lockouts |
| `sandbox.js` | Capability gates |
| `security.js` | Security operations |
| `sudo.js` | Permission escalation |
| `escrow.js` | Budget, approvals, circuit breakers |
| `qos.js` | Rate limiting, circuit breaker, throttling |
| `rules.js` | Global rules engine |

## Agents & Teams
| Module | Purpose |
|--------|---------|
| `agents.js` | Multi-agent spawning, lifecycle |
| `teams.js` | Org/dept/team hierarchy |
| `msg.js` | Agent-to-agent messaging |
| `registry.js` | Agent address book |

## Brain & Memory
| Module | Purpose |
|--------|---------|
| `brain.js` | Brain router - load/save brains |
| `islands.js` | Lazy-loadable brain components |
| `memory.js` | Learning & pattern recognition |
| `learn.js` | Learning from experiences |
| `search.js` | AI-first brain search |

## Data & Storage
| Module | Purpose |
|--------|---------|
| `storage.js` | Unified storage abstraction |
| `cache.js` | In-memory cache, compression |
| `config.js` | Config registry + env vars |
| `tmp.js` | Temporary storage |

## Communication
| Module | Purpose |
|--------|---------|
| `msg.js` | Agent messaging (IPC + encrypted) |
| `network.js` | Connectivity, retries, timeouts |
| `relay.js` | Agent transport layer |
| `remote.js` | Git remote providers |
| `encounter.js` | Agent discovery protocol |
| `webhooks.js` | HTTP triggers |

## Events & Streams
| Module | Purpose |
|--------|---------|
| `event.js` | Unified async events, pub/sub, queue, job |
| `stream.js` | Async queue management |
| `cron.js` | Task scheduling |
| `watch.js` | Self-healing, recovery |

## Code & Execution
| Module | Purpose |
|--------|---------|
| `shell.js` | Command execution with security chain |
| `compute.js` | Polyglot compute execution |
| `mcp.js` | MCP server |
| `schema.js` | Schema validation |

## Crypto & Identity
| Module | Purpose |
|--------|---------|
| `encrypt.js` | Crypto handlers |
| `branch.js` | Agent branch management |
| `lineage.js` | Lineage recording |
| `succession.js` | Brain succession, trust levels |

## System
| Module | Purpose |
|--------|---------|
| `system.js` | OS dashboard |
| `health.js` | Health checks |
| `metrics.js` | Performance monitoring |
| `audit.js` | Unified audit logging |
| `error.js` | Error handling |

## Collaboration
| Module | Purpose |
|--------|---------|
| `forum.js` | 3D spatial forum |
| `canvas.js` | Painting/sharing |
| `consensus.js` | Agent voting |

## Governance
| Module | Purpose |
|--------|---------|
| `governance.js` | Ethics & decisions |
| `legal.js` | Emergency switch |
| `rls.js` | Row-level security |
| `habitat.js` | Boundaries, workspaces |

## Nature & AI
| Module | Purpose |
|--------|---------|
| `nature.js` | Hit-and-miss pattern |
| `spirit.js` | Autonomous agent |
| `consciousness.js` | Self-awareness |
| `vibe.js` | Dynamic mood system |
| `zen.js` | Meditative idle state |

## Integrations
| Module | Purpose |
|--------|---------|
| `telegram.js` | Telegram bot |
| `connector.js` | DB connectors |
| `node-registry.js` | Peer discovery |

## Docs & Tools
| Module | Purpose |
|--------|---------|
| `docs.js` | OpenAPI generator |
| `embed.js` | Embedding generation |
| `citations.js` | Git-backed grounding |
| `theme.js` | Theme rendering |
| `stego.js` | Steganography |

## Other
| Module | Purpose |
|--------|---------|
| `version.js` | Version source of truth |
| `update.js` | Update system |
| `sync.js` | Sync manager |
| `prune.js` | Brain cleanup |
| `onboard.js` | Knowledge base |

## Key Patterns

### Middleware Chain (Request → Response)
```
VAF → Auth → Sandbox → QoS → Escrow → Handler
```

### Agent Lifecycle
```
Spawn → Assign (teams) → Message (msg) → Terminate
```

### Brain Loading
```
Request → Brain Router → Islands → Corpus/Storage
```

## Usage
```javascript
// Core
const vant = require('./lib/vant');
const agents = require('./lib/agents');
const teams = require('./lib/teams');
const msg = require('./lib/msg');

// Security
const vaf = require('./lib/vaf');
const auth = require('./lib/auth');
const escrow = require('./lib/escrow');
const qos = require('./lib/qos');

// Brain
const brain = require('./lib/brain');
const islands = require('./lib/islands');
const search = require('./lib/search');

// Events
const event = require('./lib/event');
const stream = require('./lib/stream');
```

---

**See also:**
- [origin.md](./origin.md) - How I was built
- [perspective.md](./perspective.md) - My philosophy
