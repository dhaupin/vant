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
| **Docs site** | docs.creadev.org — Jekyll + freestruct + Pagefind, published by CI on push to `main` | None (zero manual steps — see §13) |

Vant is a Node.js process whose entire state is your repository: markdown brain files, a config file, and git. There is no external database to provision. Sizing is driven by the brain size and how many agents you run.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | `engines.node >= 18` in package.json; LTS recommended |
| npm | 9+ | Ships with Node |
| Git | 2.20+ | Brain sync works through git; branch awareness built in |
| GitHub PAT | - | `repo` scope, set as `GITHUB_TOKEN` (env var, never in config). PRIVATE: treat it like a password - it lives only in `.env` (gitignored) or your shell exports, never a config file, a commit, or a public panel field |

Dependencies are deliberately tiny: `yaml`, plus the QR
symbology lane's two pure-JS MIT packages (`qrcode-generator`, `jsqr`).
CLI color is a zero-dependency internal ANSI face in `lib/theme.js`
(NO_COLOR/CI/TERM=dumb/piped output renders plain); `chalk` and the
never-imported `js-yaml` left the dependency list in pass 338. No database
driver, no Redis client.

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
| `MODEL_PATH` | Models root path (the setup wizard writes `models/private`; `config.example.ini` ships `models/public`) |
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
| Webhook receiver (+ the r/2 relay face at `POST /relay` when `relay.enabled`) | `lib/webhooks.js` | 3467 | `VANT_WEBHOOK_PORT` | `VANT_WEBHOOK_BIND` |
| Metrics/health HTTP | `lib/health.js start()` | 3468 | `VANT_HEALTH_PORT` | `VANT_HEALTH_BIND` |
| Mesh crew bus | `lib/genesis.js` | 4890-4892 | per-call `port` opt | - |
| Headless pod | `vant headless` (`vant.startHeadless()`) | MCP 3457 + REST 3456 | `VANT_MCP_PORT` / `VANT_SERVER_PORT` | `VANT_SERVER_BIND` |

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

### The webhook relay lane (r/2, optional)

With a posture armed (`vant config set relay.enabled true`, then
`vant relay gate` + `vant relay channel`), every server boot mounts the
relay face onto the webhook transport: the pod serves the HMAC-gated
`POST /relay` route (sealed `relay.ride` inside e2e envelopes + blind
`relay.hop` ciphertext forwarding), and `vant relay status` prints the
posture truth. The origin policy (docs/operations/relay.md): https-only
by default; `relay.intranetOrigins true` — the recommended LAN-scope
posture — admits plain http ONLY for loopback/RFC1918 hop targets while
cloud metadata (169.254/16) stays refused in EVERY posture;
`relay.allowPrivateOrigins` is the full lab escape, never a default.
Group-track runs prove the lane on real pods:
`npm run pilot:relay` (16 P3 lane pins + the intranet posture pin),
`npm run pilot:pods` (raster across keyed doors) and
`npm run pilot:mfg` (the carrier line).

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
vant relay status                # r/2 relay posture truth (mounted/gate/channel/counters)
vant carrier list                # carrier roster (built-ins + this brain's plates)
vant carrier plates              # persisted plate lanes (ops authoring, no door needed)
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
| Web frontend PRD | [labs/prd-web.md](labs/prd-web.md) |
| Docs site | https://docs.creadev.org/vant |
| CLI reference | https://docs.creadev.org/vant/reference/cli |

## 12. Frontends on Cloudflare Pages (set up YOUR dashboard now)

The web frontends (see `labs/prd-web.md`) deploy to Cloudflare Pages.
Each frontend is its OWN Pages project with its OWN subdomain. Three of
them exist: the home site (`vant.creadev.org`, source in `web/home/` as a
React + prestruct app — build with `npm run build:home`, artifact
`web/home/dist/` (gitignored by the `web/*/dist/` rule); the old checked-in
lander survives as the design reference `web/home/index.bak.html`), the dashboard
(`brain.creadev.org`, this section), and the relay (its own P6 project).

### 12.0 The home site setup (vant.creadev.org — the self-contained easy one)

The project to create in the CF dashboard: connect this repo, production
branch `axolotl` (or `main` after merge), then point the build at the
frontend dir — no framework guessing. The static artifact ships itself;
the bindings in step 2 below (the /status monitor's D1 + env surface)
are the only other panel work:

| Setting | Value | Why |
|---------|-------|-----|
| Framework preset | Vite | sensible defaults only — the command below owns the real pipeline |
| Root directory | `web/home` | the frontend is fully self-contained (own package.json + committed package-lock.json) |
| Install command | `npm ci` | lockfile-pinned resolution — `^` ranges never drift on the builder |
| Build command | `node scripts/parse-changelog.mjs && npx prestruct build` | mirrors `npm run build:home` minus the `cd`: regenerate `src/generated/changelog.json` from CHANGELOG.md BEFORE the prestruct build (the parity law), then the full pipeline runs — vite build → inject-brand (OG/Twitter/canonical/keywords + the four-node `{ @context, @graph }` JSON-LD per page) → prerender 8/8 routes + sitemap + robots + noindex 404. The build EXITS (serving is Pages' job) |
| Build output directory | `dist` | `web/home/dist/`, gitignored by the standing `web/*/dist/` rule — nothing to commit |
| Node version | 20+ (`NODE_VERSION=20` if the panel asks) | matches the `web/home` engines; the build is plain node tooling |
| Functions | deploy automatically with the project | `web/home/functions/` = the `/status` monitor API (`GET /api/status/summary`, the x-admin-key admin door, the `onScheduled` cron sweep). Zero wrangler strings — same law as the dashboard project |

`ssr.config.js` is committed with the fixed URLs, so unlike the dashboard
project below there is no `VANT_*` variable to define. The bindings below
are owned by the /status monitor (full route map + honest postures:
`web/home/functions/README.md`) — all in Pages settings, never code.

**The type rule, so the panel question always has one answer:** if you
could not happily print the value in a README or a support ticket, add it
as type **Secret** (encrypted, write-once: the panel never shows the
value again). Knobs, flags, and URLs are plain **Text**. One more trap:
Vite bakes every `VITE_*` BUILD variable straight into the shipped
JavaScript bundle that every visitor downloads, so a `VITE_` name must
never carry a private value anywhere in this repo's projects.

| Binding / var | Where | Value | Notes |
|----------|-------|-------|-------|
| D1 database bound as `DB` | Settings → Bindings → Add → D1 database bindings | database **`vant-pub`** | the history store. Tables self-create on first read and the six owner-named endpoints self-seed; `npx wrangler d1 migrations apply vant-pub --remote` (source: `web/home/migrations/0001_status_monitor.sql`) applies the schema deliberately instead. Both paths land on the same truth |
| `STATUS_ADMIN_KEY` | Settings → Variables and Secrets (Production AND Preview), added as type **Secret** | random secret ≥ 8 chars (`openssl rand -hex 24`) | guards POST `/api/status/admin` (alert set/clear, endpoints add/remove/reset, forced sweeps). PRIVATE: write-once, the panel never shows it again. Missing/short = the door answers 503 with the fix, fail-closed |
| `STATUS_SWEEP_SECONDS` | Settings → Variables and Secrets, type **Text** (plain, not a secret) | optional, default `600` | minimum age of a sweep before a public GET triggers a fresh one - the anti-hammer throttle |
| Sweep cadence | external (optional) | point any scheduler at `GET /api/status/summary` | Pages projects have NO cron triggers (Cloudflare ships them on Workers only; the current Pages dashboard has no such section). History stays honest anyway: every public GET runs the throttled sweep on cold data, and unswept days render "no data", never downtime |
| `VITE_STATUS_LIVE` | Settings → Build variables (Production), PLAIN TEXT by design | set to `1` ONLY after `DB` + `STATUS_ADMIN_KEY` above are live and `/api/status/summary` answers 200 | the deploy gate: until it is set, the built site hides the whole status surface (no nav entry, no walk hops, the board mounts nothing). No fallback fiction. Vite bakes it into the public bundle, so this name is permanent public surface - even after the flip |

Until the bindings are on and `VITE_STATUS_LIVE=1` is set in the build,
every status route answers 503 with the exact fix and the site simply
does not advertise status (owner direction: the surface stays out of the
menu, the walk, and the page until the monitor is real, and /status reads
the maintenance line instead).

The full flip, in order:

1. Settings → Bindings: bind the D1 database as `DB`; Settings →
   Variables and Secrets: set production `STATUS_ADMIN_KEY` **as a
   Secret** (encrypted, write-once). Redeploy.
2. Confirm the monitor answers for real: `GET /api/status/summary`
   returns 200 (not the 503 fix line).
3. Settings → Build → Build environment variables: set
   `VITE_STATUS_LIVE=1`. Redeploy again: the status stop joins the menu,
   the walk hops include it, and the D1 board replaces the maintenance
   line on /status.

Whatever lands ships pre-gated: `web/home/test/config.test.mjs`
(rides test.yml) pins the JSON-LD/route contract at source level,
`src/walk.mjs`'s tour/footer contract stays pinned by `test/walk.test.mjs`
(every walk stop must exist as a shipped route), and
`test/status-math.test.mjs` pins the monitor's pure core (defaults, day
buckets, uptime math, alert pick, admin-key compare - 35 tests total
across the three suites). `npm run lint:home` sweeps every built page for
link/fiction/stat truth.

### 12.1 Setup walkthrough (dashboard, do this while code lands)

0. **Run the local half first:** `npm run pilot:pages`
   (`scripts/pilot-pages-deploy.js`) proves everything certifiable from
   this repo - both flavor builds, the checksummed kit, and the env-var
   surface you are about to set reconciled against the vars the functions
   actually read - and prints the checklist fresh. It exits 1 on any
   drift; fix before touching the panel.
1. **Create the Pages project** in the CF dashboard: connect this git
   repo, production branch `axolotl` (or `main` after merge).
2. **Configure the build** in project settings:

   | Setting | Value |
   |---------|-------|
   | Framework preset | Vite |
   | Root directory | `web/dashboard` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | 22 (env var `NODE_VERSION=22` if the panel asks; repo root `.nvmrc` says 22 — pass 338: 20.20.0 is EOL in the CF log and npm 10.9.2 on node 20 carries the npm/cli#9787 arborist crash, reproduced verbatim on this graph) |

   Functions under `web/dashboard/functions/` deploy AUTOMATICALLY with
   the project - no wrangler config anywhere (prd-web.md 3.7).
3. **Set the Pages variables** (Settings → Variables and Secrets, both
   Production and Preview; the type rule below the vant-home table applies
   here too - plain Text unless the row says **Secret**):

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `VANT_PROPERTY_LOCAL_ORIGIN` | your pod's MCP door, e.g. `https://pod.example.com` or the tunnel URL below | REQUIRED. Make it HTTPS (Works' runtime upgrades it otherwise) |
   | `VANT_PROPERTY_LOCAL_NAME` | `home pod` (any label) | optional; shown in the switcher |
   | `VANT_EDGE_RATE_PER_MIN` | `120` | optional; per-session edge budget |
   | `VANT_RELAY_ENABLED` | `1` | Text, optional; PIGGYBACK THE RELAY on THIS deploy (dashboard-relay flavor, prd-relay.md 4.0): mounts the gated `/api/r/*` Mode R surface on your Pages functions. Off = the routes do not exist (404), same as the pod's unmounted posture |
   | `VANT_RELAY_GATE_KEY` | 256-bit hex (mint with `vant relay gate`) | **PRIVATE: add as type Secret.** REQUIRED when the relay posture is on; hops MUST present it as `x-relay-gate` (timing-safe). No key set = the surface serves NOTHING (fail-closed). Hop bodies are encrypted envelopes only - plaintext refuses; the edge holds no channel keys |
   | `VANT_RELAY_POD_ORIGIN` | (declared, unread today) | Contract-declared reserve key: the vendored kit's `EDGE_ENV_KEYS` names it, and NO edge face reads it - the solo relay forwards to the hop frame's client-declared origin, and the piggyback face resolves pods through the `VANT_PROPERTY_<ID>_ORIGIN` pairs above. Documented for surface completeness; removing it is kit surgery, not a settings tweak |

   **Email-OTP accounts (P2) - the KV binding:** create a KV namespace
   (Workers & Pages -> KV -> create, any name; then the Pages project
   -> Settings -> Functions -> KV namespace bindings) and bind it as
   `BOLETE_KV`. Until the binding exists, email sign-in answers a
   typed `E_STORE_UNCONFIGURED` and the paste-token gate stays the
   fallback - honest by design.

   The email vars (all PAGES SETTINGS, never code):

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `RESEND_API_KEY` | your resend.com API key | **PRIVATE: add as type Secret.** first-party sender path (no SDK; plain fetch) |
   | `EMAIL_FROM` | `Bolete <signin@your-domain.com>` | Text; a verified sender domain |
   | `EMAIL_WEBHOOK_URL` | any provider's send endpoint | Text, optional; generic fallback (JSON: `{to, subject, text}`) |
   | `EMAIL_WEBHOOK_TOKEN` | Bearer secret for the webhook | **PRIVATE: add as type Secret**, optional |
   | `VANT_EMAIL_SALT` | a long random string | **PRIVATE: add as type Secret.** RECOMMENDED either way: hashes the email (and codes' key hashing); unset = unsalted hash |

   The property ID for this first install is **`local`** (the URL its
   views ride is `?p=local`;   the resolver reads `VANT_PROPERTY_<ID>_ORIGIN` upper-cased). This
   is a ONE dashboard -> N installs model: each attached Vant install
   gets its OWN pair of vars in THIS SAME Pages project. The vars take
   multiple definitions - one pair per install:

   ```ini
   VANT_PROPERTY_LOCAL_ORIGIN=https://home-pod.example.com   # install 1
   VANT_PROPERTY_LOCAL_NAME=home pod
   VANT_PROPERTY_WORK_ORIGIN=https://work-pod.example.com    # install 2
   VANT_PROPERTY_WORK_NAME=work pod
   VANT_PROPERTY_STAFF_ORIGIN=https://crew.example.com       # install 3
   VANT_PROPERTY_STAFF_NAME=crew pod
   VANT_PROPERTY_LAB_ORIGIN=https://lab-pod.example.com      # install 4
   VANT_PROPERTY_LAB_NAME=lab test pod
   ```

   Each new pair appears in the dashboard's property switcher (4 above,
   4 entries) without redeploying app code. Switching keeps your route,
   module, and filters; everything data-side re-keys to the chosen pod
   and the SSE stream reconnects (prd-web.md 3.4).
4. **Make the pod reachable from the edge** - pick ONE:
   - **Tunnel (recommended for home/VPS pods):** `cloudflared tunnel
     create vant-pod`, route a hostname like
     `pod-<murmur>.<your-domain>.com` to `http://localhost:3457`, run
     the connector on the pod host. Stable egress identity, no ports
     opened, no allowlist churn - this is the prd-web.md 8.3 fallback
     path and it dodges the IP-allowlist refresh problem entirely.
   - **IP allowlist path:** let pages origin fetches hit the door
     (fetch egress comes from Cloudflare IP ranges,
     https://www.cloudflare.com/ips/) and allowlist those ranges at the
     pod's firewall with a scheduled refresh - broad by nature, and
     refreshes are the owner-posture requirement (prd-web.md 8.3).
5. **Mint an identity** on the pod:
   `vant guest issue --name <seat>` and copy the `vguest_` token.
6. **Log in**: open the dashboard's subdomain, paste the token at the
   gate. The status page will name anything still missing (functions,
   origin var, bridge), exactly as built.
7. **Point the lander's "Dashboard" link** at the new subdomain when
   satisfied.

### 12.2 Mode B — pod same-origin (the local-ops fallback, OFF by default)

When a Pages deployment is not answering (or a workstation cannot reach
the tunnel), the pod can serve a frontend bundle itself: the browser
calls `/mcp/*` directly, same origin, zero CORS, zero Worker hop.

```bash
vant config set mcp.serveWeb web/dashboard   # or env VANT_MCP_SERVE_WEB
```

Honest mechanics (pins: `test/pod-serve-web.test.js`):

- The value is a frontend DIRECTORY (e.g. `web/dashboard`) whose `dist/`
  build stays OFF with a loud warning - the door serves nothing it did
  not build. (Example: `VANT_MCP_SERVE_WEB=web/dashboard` serves the
  dashboard build. The home frontend ships its static index.html
  checked in with no build, so the door never serves it - point
  serveWeb at a built frontend.)
- The MCP door keeps every owned route: `/mcp/exec`, `/mcp/events`,
  `/mcp/tools`, `/health`, and tool routes all answer first. Static GETs
  only; POSTs unknown to the door keep the same 404 JSON as before.
- Static GETs ride the door's OWN deny chain: the DNS-rebinding Host
  guard, the cross-origin POST/origin guard, and the EW4 per-client rate
  budget all apply - serving is not a second, weaker surface. Auth on
  `/mcp/exec` is UNCHANGED: requireKey and guest tokens gate exec exactly
  as they do in Mode A.
- Path guards: dot-led segments (`.env`, `.git`) and anything that would
  resolve outside the bundle are refused 403; client-side routes fall
  back to `index.html` (the dashboard router owns its own 404 pages).
- One door serves one frontend bundle. A second attached install goes
  through Pages vars per the main table above.

### 12.3 The contract (unchanged)

| Aspect | Rule |
|--------|------|
| Location | `web/<app>/` - fully self-contained; nothing it needs lives at repo root |
| Build | Vite build producing `dist/`; the build exits (serving is Pages' job) |
| Functions | `web/<app>/functions/` = the `/api/*` Worker proxy (auth forwarded, never logged) |
| Cloudflare config | PAGES SETTINGS ONLY: vars/bindings. Zero wrangler strings in code |
| Pod posture | pod stays loopback/private; the Worker is the single bridge |
| Auth | MVP: paste a guest token (HttpOnly session cookie set by the bridge drives the SSE stream); P2: email-OTP accounts + server-side session binding |
| Multi-install | the `VANT_PROPERTY_<ID>_*` env registry = one deployment, N installs, view state preserved on switch |

Everything in sections 1-11 remains the POD guide; frontends never
change the pod's deployment face.

### 12.4 The relay postures (prd-relay.md; the two sides never blur)

Four honest postures, each fully supported, off by default:

| Posture | Where it is set | What it does |
|---------|-----------------|--------------|
| OFF (default) | nothing to set | no /api/r surface exists anywhere; a browser that probes it gets the same 404 a pod's unmounted mode gives |
| POD-ONLY relay (headless flavor) | the pod: `vant config set relay.enabled true` + `vant relay gate` | the REST server mounts the gated `/api/r/*` Mode R surface on its EXISTING posture (loopback/private; widening for WAN hops is YOUR deliberate edge - TLS + auth posture per section 4) |
| DASHBOARD PIGGYBACK (dashboard-relay flavor) | Pages settings: `VANT_RELAY_ENABLED=1` + `VANT_RELAY_GATE_KEY=<256-bit hex, mint with `vant relay gate`>` | the dashboard's OWN functions serve the same gated Mode R contract (vendored kit, parity-pinned - no separate Pages project; it rides this deploy) |
| SOLO relay (solo-relay flavor) | its OWN Pages project rooted at `web/relay/` (same two env keys, read at request time) | the PURE live endpoint: chain hops only, no admin surfaces by construction, no default profile pin; exec + the R1 SSE stream-through (`GET /api/r/events`) |

Fail-closed in every posture: enabled without a gate key serves NOTHING
(hops answer `E_RELAY_GATE_REQUIRED`); hop bodies are encrypted
envelopes ONLY (plaintext refuses, no downgrade); the gate header is
spent at the gate, never forwarded.

**Using relays is the USER'S side** and never env-side: dashboard
Settings #4 carries a **Use relays** toggle (reach pod through relay
hops / direct, persisted) plus the operator's run-a-relay posture card
that reads `/api/r/capabilities` and states the truth. Under the
corrected arc (pass 233) the dashboard also RUNS WITH a relay as a
setting: **Run with a relay (web/relay endpoint)** takes the relay's
origin and verifies it live against that relay's public caps page. The full
operational walkthrough lives in the [relay playbook](/vant/operations/relay-playbook)
(serving, hosting the solo flavor, piggybacking, using, verifying); the mechanism spec is
[labs/prd-relay.md](labs/prd-relay.md) and the operations page is
[docs/operations/relay.md](docs/operations/relay.md).

---

## 13. The Docs Site (docs.creadev.org — CI-owned, zero panel work)

The docs hub is the one Vant surface you never deploy by hand: every
push to `main` runs `.github/workflows/docs.yml`, and the artifact
publishes to GitHub Pages (which serves the docs.creadev.org domain).
`workflow_dispatch` re-runs it on demand. Nothing to bind, no secrets to
mint, no dashboard walk.

### The pipeline (the proven order — order matters)

| Step | What it does | Note |
|------|--------------|------|
| 1. `bundle exec jekyll build` (Ruby 3.2, `bundler-cache: true`) | Jekyll renders every page into `docs/_site`, nested under `/vant/` (`baseurl`) | render-time nav and redirects plugins run HERE, inside Jekyll |
| 2. `npx freestruct --strict` | the post-render SEO layer over the Jekyll output | config discovery finds `docs/freestruct.config.yml`; `--strict` FAILS CI on any broken internal link |
| 3. `npx pagefind --site _site` | the search index is built AFTER freestruct | the engine rewrites the HTML, so the index must match what actually ships |
| 4. upload artifact + deploy-pages | `docs/_site` goes live | the whole site lands as one GitHub Pages deployment |

What the freestruct layer generates over the Jekyll output (config:
`docs/freestruct.config.yml`, engine pinned `freestruct@1.0.0` exact in
`docs/package.json` alongside `pagefind@^1.5.2`): per-page canonical/OG
metas (missing-only — the hand-written tags in `_layouts/default.html`
are never touched), a full `sitemap.xml` with real lastmod, a
basePath-aware `robots.txt` pointer, `feed.xml`, a noindex `404.html`,
and the broken-link check. Search stays with Pagefind (`searchIndex:
false` — same owner call as the freestruct docs site itself);
`basePath: /vant` is trusted, never doubled.

### Release stamping + local preview

```bash
# Version truth: stamps package.json's version into the docs frontmatter
# (8 files). This does NOT build the site - the build is CI's.
vant docs-build
vant docs-build --commit      # ...then git add -A + commit the stamp

# Local docs preview (render layer):
cd docs && bundle install && bundle exec jekyll serve

# Replicate the CI order + its strict gate locally (cwd matters: the
# engine's config discovery walks upward FROM your cwd, and glob the
# output dir exactly like the workflow does):
cd docs
npm install --no-audit --no-fund
npx freestruct --strict
npx pagefind --site _site
cd ..

# The five docs gates (style, links, frontmatter, language, truthfulness):
npm run lint:docs
```

The **Freestruct docs site itself** (freestruct.creadev.org, crosslinked
from the docs footer) is its own project — the flagship site of the same
engine that post-renders this repo's docs. Nothing in this repo builds it.

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
