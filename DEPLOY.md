# Vant Deployment Guide

> **Production deployment** - local, Docker, cloud, edge. Deny-by-default security chain, git-backed sync, multi-brain layout, multi-agent crews.

Every claim in this guide is checked against the code on `axolotl` (v0.8.6). Where a command is not implemented, this guide says so instead of guessing.

---

## Overview

| Target | Use Case | Complexity |
|--------|----------|------------|
| **Local** | Development, testing, single-user | Low |
| **Docker** | Containerized, reproducible | Medium |
| **Cloud** | Scalable, managed | Medium |
| **Edge/IoT** | ARM, Raspberry Pi, resource-constrained | Low |

Vant is a Node.js process whose entire state is your repository: markdown brain files, a config file, and git. There is no external database to provision. Sizing is driven by the brain size and how many agents you run.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | `engines.node >= 18` in package.json; LTS recommended |
| npm | 9+ | Ships with Node |
| Git | 2.20+ | Brain sync works through git; branch awareness built in |
| GitHub PAT | - | `repo` scope, set as `GITHUB_TOKEN` (env var, never in config) |

Dependencies are deliberately tiny: `chalk`, `js-yaml`, `yaml`. No database driver, no Redis client.

---

## 1. Local Deployment

### Install

```bash
# From source (the npm `vant` package is an unrelated Vue UI library)
git clone https://github.com/dhaupin/vant.git
cd vant
npm ci
node bin/vant.js start
```

### Configure

```bash
# Interactive setup: writes config.ini (repo, stegoframe room)
# Never stores tokens. Set GITHUB_TOKEN as an environment variable.
vant setup
```

That produces a `config.ini` from `config.example.ini` with keys:

| Key | Purpose |
|-----|---------|
| `VANT_VERSION` | Version marker |
| `MODEL_PATH` | Private brain root (default `models/private`) |
| `STEGOFRAME_URL/ROOM/PASSPHRASE/MODE` | Transport for the stegoframe channel |
| `GITHUB_REPO` / `GITHUB_BRANCH` | Sync target (`owner/repo`, branch) |
| `GITHUB_TOKEN` | Placeholder reference - use the env var |
| `POLLING_INTERVAL` | Poll interval in ms (default 10000) |
| `MAX_REQUESTS_PER_HOUR` | Request budget (default 360) |

Secrets live in the environment or `.env` (copy `.env.example`): `GITHUB_TOKEN` is the one required for sync. Keep `.env` out of version control.

### Verify

```bash
vant health       # Brain, config, env, dirs, migration status, locks, debris
vant sync --status
```

`vant health` also warns on an old single-brain layout. If it does:

```bash
vant migrate --status             # What would move
vant migrate --dry-run            # Preview, touch nothing
vant migrate                      # Import (default brain name: vant)
vant migrate --brain-name mybrain # Or name it explicitly
```

---

## 2. Brain Layout (v0.9 Multi-Brain)

Since the axolotl line, brains live in per-brain directories with the active stack in `models/state.json`:

```
models/
├── public/            # OS templates, shared across installs
│   └── <brain>/       # e.g. models/public/vant/, boot/ with horcrux SVGs
└── private/           # Runtime data, per-brain
    └── <brain>/       # identity.md, lessons.md, state/, orgchart/, config.json
```

- The active brain resolves from `VANT_BRAIN` (env), then `models/state.json`, then the default brain `vant`.
- Legacy flat layouts (`models/public/*.md`, no per-brain dirs) migrate automatically on `vant start` via `lib/migrations.js`. Detection is content-based, idempotent, and never fires on an already-multi-brain tree. Do not hand-move brain files; use `vant migrate`.
- Per-brain runtime config lives in `models/private/<brain>/config.json`; `vant config get|set` reads and writes it.

Run `vant migrate --status` (or `vant health`) any time you are unsure which layout a tree is on.

---

## 3. Docker Deployment

The repo ships a remote-ready `Dockerfile` (node:20-alpine, multi-arch amd64/arm64) and a `docker-compose.yml` (long-running app + optional telegram bot).

```bash
# Build the multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 -t dhaupin/vant --push .

# Or compose: app (MCP 3457 + REST 3456) + bot, persistent brain volume
docker compose up -d
```

The image installs runtime dependencies, runs as a non-root `vant` user, mounts state at `/app/models`, and its default command is the full runtime: `node bin/vant.js all` (MCP + REST in one process).

```bash
# VPS / remote host: publish the ports, keep the brain on a volume
docker run -d --name vant \
  -p 3456:3456 -p 3457:3457 \
  -e GITHUB_TOKEN -e GITHUB_REPO=owner/repo \
  -v vant-models:/app/models \
  --restart unless-stopped \
  dhaupin/vant:latest
```

Notes:

- The image binds **all interfaces inside the container** (`VANT_SERVER_BIND=0.0.0.0`). That is the correct container default: docker `-p` forwards to the container's IP, so a loopback bind inside would be unreachable through published ports. Exposure is controlled at the host edge - publish on host loopback (`-p 127.0.0.1:3456:3456`) to keep the port private, put a TLS reverse proxy in front, or run with `--network host` and set the bind envs to `127.0.0.1` yourself.
- The image's `HEALTHCHECK` probes `GET /health` on the REST server; a bare container running the default command stays `healthy` only while servers answer. The old `vant health` CMD exited 0 immediately - it was never a service.
- There is no Redis dependency anywhere in the codebase. Ignore older guides that mention one.

---

## 4. Services and Ports

The Vant port map (pass 127 audit). Four listeners, all loopback-bound by default, all env-overridable. 3456/3457/3467/3468 were checked against common co-tenants: 3000 (Grafana, Gitea, Next dev), 3100 (Loki), 5432 (postgres), 6379 (redis), 8080 (generic HTTP) are all avoided.

| Service | Command | Port | Env override | Bind env |
|---------|---------|------|--------------|----------|
| REST server | `vant server` | 3456 | `VANT_SERVER_PORT` | `VANT_SERVER_BIND` |
| MCP server | `vant mcp` (or `node bin/mcp.js`) | 3457 | `VANT_MCP_PORT` | `VANT_MCP_BIND` |
| Webhook receiver | `lib/webhooks.js` | 3467 | `VANT_WEBHOOK_PORT` | `VANT_WEBHOOK_BIND` |
| Metrics/health HTTP | `lib/health.js start()` | 3468 | `VANT_HEALTH_PORT` | `VANT_HEALTH_BIND` |
| Mesh crew bus | `lib/genesis.js` | 4890-4892 | per-call `port` opt | - |
| Headless mode | `vant.startHeadless()` | follows 3456 | `VANT_SERVER_PORT` | `VANT_SERVER_BIND` |

Before pass 127: webhooks defaulted to the REST port (3456, a guaranteed collision), the mesh node runner defaulted its MCP door to 3456 too, islands fell back to 3100 (Loki), headless hardcoded port 3000, and the health HTTP server bound 0.0.0.0 - the one listener with no bind argument.

```bash
# REST API with TLS + auth (plaintext is allowed on loopback binds;
# a non-loopback bind without TLS refuses unless --insecure is passed)
vant server --port 3456 --cert ./cert.pem --key ./key.pem --auth

# MCP for AI agents (HTTP is the door MCP clients use)
vant mcp --stdio          # one-shot JSON dispatch on stdin (not an MCP transport)
vant mcp --server -p 3457 # MCP-over-HTTP mode
vant config set mcp.requireKey true
vant config set mcp.apiKey "your-secret-key"
```

`vant mcp` auto-wires the module surface into JSON-RPC tools (brain read/write, memory store, search, migration status). Browse everything available at `GET http://localhost:3457/tools`. Optionally require `x-api-key`/Bearer via `mcp.requireKey`.

Every listener binds to `127.0.0.1` by default on bare installs (the Docker image overrides to `0.0.0.0` inside the container - see section 3). Plaintext HTTP is allowed on loopback binds; a non-loopback bind without TLS refuses to start unless you pass `--insecure` explicitly. On a VPS, either keep ports on host loopback and front them with a reverse proxy, or widen deliberately with TLS + auth. Always set `mcp.requireKey`/API keys before widening anything.

`vant all` starts both in one process (`vant.startFull()`).

---

## 5. Brain Sync (Git Providers)

Sync is git-backed and push/pull explicit by design. From `bin/sync.js`:

```bash
vant sync --push "brain update"   # Commit and push the current branch
vant sync --pull                  # Default action: pull/reset to origin
vant sync --status                # git status
```

Behavior worth knowing before you script around it:

- Sync works on the **current branch**. It never hard-codes a branch.
- Protected branches (`main`, `master`) require explicit opt-in: `--branch main`. A pull that would `git reset --hard` a protected branch is refused.
- Tokens are the caller's job: pass `GITHUB_TOKEN` in the environment. Vant never persists credentials; the token is not written into config files or git helpers.
- Remote/repo come from `config.ini` (`GITHUB_REPO`) plus `GITHUB_BRANCH`.

Cloud targets are ordinary Node hosts. Run the process, mount or clone the repo, set `GITHUB_TOKEN` + `GITHUB_REPO`, and let the brain live on a persistent volume. There is no Vant-specific cloud controller, no scheduler, and no service mesh to configure.

---

## 6. Security Hardening

The chain is deny-by-default and runs on every operation: sandbox capabilities, input validation (vaf), rate limiting (qos), escrow approval, brain locking. Key facts:

- **Sandbox capabilities** default in `lib/sandbox.js`: `read`/`load`/`list` are allowed, `write` is denied, and escalation goes through explicit grants. `vant org status` shows what the current process holds.
- **Operator grants** are explicit and deliberate: `vant org grant` (persists to the current brain's config unless `--session-only`), optionally scoped with `--scopes` / `--capabilities`. Bare `vant org` is read-only status - it never grants. Boot hydration is widen-only: a persisted grant can widen a scoped boot's caps, never narrow them.
- **Sudo policies are code plus an optional policy file**, not a config.ini section. `lib/sudo.js` loads `models/private/sudo/policies.json` (override with `VANT_SUDO_POLICIES_PATH`). A grant also creates a sudo task so scope-level sudo verdicts apply.
- **Input validation** (vaf) enforces string length, depth, array length, path traversal blocks. Tunables like `MAX_STRING_LENGTH`, `MAX_DEPTH`, `BLOCK_PATH_TRAVERSAL` exist in `config.example.ini`.
- **Audit** is a JSON ledger at `models/private/<brain>/.audit.json` (brain-scoped, capped and rotated into `models/audit-rotate/`). `vant audit` generates a dynamic `AUDIT.md` report from the codebase; `vant audit --json` for machine output.
- **Brain locking**: file-mutex + lease (brain-lock layer) with in-process counters surfaced by `vant health`. A crash never leaves torn memory: writes go through a WAL plus atomic rename.

There is no `[sandbox]`/`[sudo]`/`[audit]` section in config.ini. Any guide showing one is fiction.

---

## 7. Monitoring

### Health

```bash
vant health           # Full check (also reports legacy-layout notice, locks, debris)
vant health --sweep   # Remove stranded write temps (debris janitor)
vant system status    # Machine-readable JSON of layer status
```

There is no `--json` flag on `health`; use `vant system status` for JSON.

### Key Metrics

| Metric | Source | Alert On |
|--------|--------|----------|
| Circuit breaker state | `qos.getCircuitBreakerStatus()` | OPEN |
| Escrow budget headroom | `escrow.canSpend(agentId, amount)` | false |
| Agent roster / queue | `agents.list()` / `agents.pollWork()` | quota reached |
| Lock contention | `vant health` lock counters | rising refusals |
| Audit anomalies | `models/private/<brain>/.audit.json` | sandbox denials |

### Logs

```bash
# Structured audit ledger (JSON entries, brain-scoped)
tail -f models/private/<brain>/.audit.json

# Rotated archives
ls models/audit-rotate/

# Process logs are stdout/stderr; capture them with your supervisor
pm2 logs vant   # or: journalctl -u vant, docker logs vant
```

There is no `--log-format=json` flag. Use `vant audit --json` for machine-readable audit output.

---

## 8. Backup and Restore

Three real tools. Passwords for horcrux/transform follow the filename convention `<agent>-p_<password>.svg` - the text after `p_` in the filename IS the passphrase (see `models/public/vant/boot/README.md`).

### Point-in-time backup (`vant backup`)

```bash
vant backup create              # Snapshot the brain into backups/
vant backup list                # List backups/
vant backup restore backups/brain-backup-2026-10-05.tar.gz
```

`backup create` takes no flags (no `--name`/`--password`). Scheduling is not implemented; `vant backup schedule` prints a cron recipe and exits 1. Drive it from cron:

```bash
# Daily at 03:00
0 3 * * * cd /opt/vant && node bin/vant.js backup create >> vant-backup.log 2>&1
```

### Horcrux (encrypted, portable brain-in-an-image)

```bash
vant horcrux inspect [path] [password]   # Preview what would restore
vant horcrux create [path] [password]    # Create from current state
vant horcrux restore [path] [password]   # Restore brain from SVG
vant horcrux refresh [password]          # Regenerate the boot horcrux in place
```

With no path, horcrux scans the brain stack and uses the first `<agent>-p_*.svg` under `models/public/<brain>/boot/`.

### Transform (full/horcrux/extract pipeline)

```bash
vant transform gather                  # Pull state together
vant transform full                    # Full pipeline
vant transform horcrux <svg> <pass>    # Embed brain into an SVG
vant transform backup                  # Backup step
vant transform extract <svg> <pass>    # Pull brain out of an SVG
vant transform restore <svg> <pass>    # Restore from SVG
vant transform status
```

---

## 9. Scaling

### Multi-Agent Crews

Quota-configurable roster per install (`agents.maxAgents`, default 10; override with `VANT_AGENTS_MAX`). The programmatic API is synchronous spawn + explicit flush:

```javascript
const agents = require('./lib/agents');

// spawn is SYNC: pass an options object, get a record back
const a = agents.spawn({ name: 'Claude', role: 'Assistant' });
if (a.error) throw new Error(a.error);

agents.list();                          // roster snapshot
await agents.delegate(a.id, 'Task');    // hand off work
await agents.flush();                   // drain before process exit
```

There is no `agents.spawn('name', {budget})` string-signature, no `getSummary()`, and no `terminate` in old docs' shape - use the exports above (`terminate`/`kill` take an agent id).

### Multi-Brain

Run multiple named brains side by side (`models/public/<brain>/`, `models/private/<brain>/`) and switch via `VANT_BRAIN` or the brain stack in `models/state.json`. Agents scoped with `VANT_BRAIN` get their own brain-scoped config, org capabilities, and audit ledger.

### External Services

Vector/search connectors exist behind `vant connector` (list / status / connect / disconnect). Code-available: qdrant, pinecone, weaviate, vector. Remote state via `vant s3` (`--status`, `--test`, `--ls`, `--push`, `--pull` with `VANT_REMOTE_*` env vars) and `vant mirror` (`--status`, `--verify`, `--resync`).

There is no distributed-locking service to deploy. Brain locking is local file-mutex + lease, which is exactly right for single-host or repo-as-state deployments.

---

## 10. Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `Sync failed` / push refused | Protected branch guard | Work on a feature branch or pass `--branch <name>` explicitly |
| `Config not set. Run vant setup first.` | Missing `GITHUB_REPO` | `vant setup`, set `GITHUB_TOKEN` in env |
| `E_SANDBOX` on a teams write | Deny-by-default caps | `vant org status`, then `vant org grant --scopes ...` |
| `Agent quota reached (max N)` | MCP crew full (N is the configured `agents.maxAgents`) | Terminate idle agents (`agents.terminate(id)`) or raise `agents.maxAgents` |
| Old-layout warning on every command | Legacy brain tree | `vant migrate` (see section 2) |
| Stranded `<file>.<uuid>` temps | Crash during write | `vant health --sweep` |
| `circuit OPEN` in logs | Provider failing repeatedly | Check token/network; breaker resets after timeout |

### Debug Commands

```bash
vant health                      # Everything, one screen
vant system status               # JSON layer status
vant org status                  # Current scopes + capabilities
vant rate status                 # Rate limiter state (reset: vant rate reset <clientId>)
vant config get <key>            # Effective brain-scoped config
node -e "console.log(require('./lib/sandbox').canRead())"   # Direct sandbox probe
```

---

## 11. Cross-References

| Topic | Doc |
|-------|-----|
| Brain architecture | [labs/prd-brain.md](labs/prd-brain.md) |
| Agent system | [labs/prd-agents.md](labs/prd-agents.md) |
| Storage layer | [labs/prd-storage.md](labs/prd-storage.md) |
| Security model | [labs/prd-security.md](labs/prd-security.md) |
| Sudo system | [labs/prd-sudo.md](labs/prd-sudo.md) |
| Org and teams | [labs/prd-org-teams.md](labs/prd-org-teams.md) |
| Audit findings | [labs/archives/audits/AUDIT_FINDINGS.md](labs/archives/audits/AUDIT_FINDINGS.md) |
| Task tracker | [labs/TASKS.md](labs/TASKS.md) |
| Docs site | https://docs.creadev.org/vant |
| CLI reference | https://docs.creadev.org/vant/reference/cli |

---

## Quick Reference Card

```bash
# Daily operations
vant start                     # Full startup (health, layout check, auto-migrate)
vant health                    # System health (+ --sweep for debris)
vant sync --push "message"     # Commit + push brain
vant sync --pull               # Pull brain (default action)
vant mcp                       # MCP server on :3457
vant server                    # REST server on :3456
vant backup create             # Snapshot brain to backups/
vant horcrux create            # Encrypted portable brain SVG
vant migrate --status          # Brain layout status
vant org status                # Current scopes/capabilities (read-only)
vant system status             # JSON diagnostics
```

For the full routed command list, run `vant --help` - every verb in the dispatcher is first-class, and `mcp`/`api`/`all` are handled inline.

---

*For development setup, see [README.md](README.md). For the agent contract, see [AGENTS.md](AGENTS.md). For architecture PRDs, see [labs/](labs/).*
