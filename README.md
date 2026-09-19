# Vant

> **Persistent Multi-Brain Agent Runtime** — Defense-in-depth security, capability-based access, time-bounded sudo escalation.

[![Tests](https://img.shields.io/badge/tests-500%2B%20passing-brightgreen)]()
[![Branch](https://img.shields.io/badge/branch-axolotl-blue)]()
[![Security](https://img.shields.io/badge/security-deny--by--default-red)]()
[![Version](https://img.shields.io/badge/version-0.8.6-orange)]()

---

## Quick Start

```bash
# Clone and setup
git clone https://github.com/dhaupin/vant.git
cd vant
./bin/setup.js

# Start Vant
./bin/vant.js init

# Think with the brain
./bin/vant.js think "What is the architecture?"

# Act via agents
./bin/vant.js agent spawn researcher "Analyze the codebase"
```

---

## Architecture Overview

| Layer | Description | PRD |
|-------|-------------|-----|
| **Brain** | Persistent memory, multi-format, sync/merge | [prd-brain.md](labs/prd-brain.md) |
| **Agents** | Multi-agent crew, spawn/delegate/workflow | [prd-agents.md](labs/prd-agents.md) |
| **Storage** | Atomic writes, SHA256, multi-backend | [prd-storage.md](labs/prd-storage.md) |
| **Sync** | 3-way merge, multi-provider, RAID | [prd-brain.md#7-sync-integration](labs/prd-brain.md#7-sync-integration) |
| **MCP** | JSON-RPC, compute connectors, tools | [prd-agents.md#9-mcp-integration](labs/prd-agents.md#9-mcp-integration) |

---

## Security Model (Defense-in-Depth)

```
Request → Sandbox → VAF → QoS → Escrow → RLS → Operation
```

| Layer | File | Key Feature |
|-------|------|-------------|
| **Sandbox** | `lib/sandbox.js` | Deny-by-default, 8 caps require sudo |
| **VAF** | `lib/vaf.js` | Path traversal, injection, pollution protection |
| **QoS** | `lib/qos.js` | Rate limit, circuit breaker, bulkhead |
| **Escrow** | `lib/escrow.js` | Operation budget |
| **RLS** | `lib/rls.js` | Per-resource access |
| **Sudo** | `lib/sudo.js` | Time-bounded escalation, whitelist, audit |
| **Boot** | `lib/boot.js` | Auto-escalation, revalidation loop |

> **Full Security PRD:** [labs/prd-security.md](labs/prd-security.md)

---

## Sudo Escalation System

- **7 Service Whitelists**: boot, network, storage, sync, mcp, agents, default
- **Time-Bounded**: TTL (default 5min), auto-revalidate
- **Audit Trail**: Every escalation logged with context
- **Boot Integration**: Auto-escalates write/network/spawn/exec at startup

> **Full Sudo PRD:** [labs/prd-sudo.md](labs/prd-sudo.md)

---

## Provider Support

| Provider | API | 3-Way Merge | Status |
|----------|-----|-------------|--------|
| GitHub | REST/GraphQL | ✅ | Production |
| GitLab | REST | ✅ | Production |
| Bitbucket | REST | ✅ | Production |
| Gitea | REST | ✅ | Production |
| SelfHosted | Git CLI | ✅ | Production |

All providers implement `pullBrainFiles()` for true 3-way merge in `pullAny()`.

---

## Testing

```bash
# All tests
npm test

# Specific suites
node test/sudo-integration.test.js    # 16 tests
node test/security-hardening.test.js  # 26 tests
node test/sudo.test.js                # 7 tests
node test/vant.test.js                # 16 tests
node test/network.test.js             # 22 tests
node test/agents.test.js              # 17 tests
node test/sync.test.js                # 18 tests
node test/mcp.test.js                 # 6 tests
node test/brain.test.js               # 75/77 tests
```

---

## Branch Status

- **Active Branch:** `axolotl` (production-ready)
- **Security Fixes:** 38 (P0:10, P1:10, P1.5:4, P2:10, Sudo:1, Revert:1, P0-final:2)
- **Tests:** 500+ passing across 50+ test files
- **Providers:** GitHub, GitLab, Bitbucket, Gitea, SelfHosted — all with 3-way merge

---

## Documentation

| Destination | Purpose |
|-------------|---------|
| [/docs/](docs/) | Full documentation site (Jekyll) |
| [/labs/](labs/) | **Source of Truth** — 5 Architecture PRDs |
| [/labs/archive/](labs/archive/) | Retired docs (old README, CHANGELOG, etc.) |

### PRD Index (in `/labs/`)
- [prd-sudo.md](labs/prd-sudo.md) — Time-based escalation with whitelists
- [prd-brain.md](labs/prd-brain.md) — Brain architecture, modes, sync, islands
- [prd-agents.md](labs/prd-agents.md) — Agent crew, lifecycle, delegation, MCP
- [prd-storage.md](labs/prd-storage.md) — Atomic writes, backends, checksums
- [prd-security.md](labs/prd-security.md) — Defense-in-depth, layers, migration

### Key Documents
- [AUDIT_FINDINGS.md](labs/AUDIT_FINDINGS.md) — Complete security audit (38 fixes)
- [TASKS.md](labs/TASKS.md) — Session task tracker with P3 roadmap
- [MEM.md](labs/MEM.md) — Agent memory dump for handoff
- [AGENTS.md](AGENTS.md) — Full agent system documentation
- [DEPLOY.md](DEPLOY.md) — Deployment guide

---

## Quick Links

- **Security Audit:** [labs/AUDIT_FINDINGS.md](labs/AUDIT_FINDINGS.md)
- **Task Tracker:** [labs/TASKS.md](labs/TASKS.md)
- **Memory Dump:** [labs/MEM.md](labs/MEM.md)
- **Agent System:** [AGENTS.md](AGENTS.md)
- **Deployment:** [DEPLOY.md](DEPLOY.md)
- **Archive:** [labs/archive/](labs/archive/)

---

## License

MIT — See [LICENSE](labs/archive/root/LEGAL.md) for details.