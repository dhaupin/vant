# Vant Deployment Guide

> **Production Deployment Guide** — Local, Docker, Cloud, Edge. Defense-in-depth security, multi-provider sync, multi-agent crews.

---

## Overview

| Target | Use Case | Complexity |
|--------|----------|------------|
| **Local** | Development, testing, single-user | Low |
| **Docker** | Containerized, reproducible, CI/CD | Medium |
| **Cloud** | Scalable, managed, multi-region | High |
| **Edge/IoT** | ARM, Raspberry Pi, resource-constrained | Medium |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | LTS recommended |
| Git | 2.30+ | For provider sync |
| SSH Keys | Ed25519 | For Git providers |
| Provider Tokens | — | GitHub PAT, GitLab PAT, etc. |

---

## 1. Local Deployment

```bash
# Clone
git clone https://github.com/dhaupin/vant.git
cd vant

# Run setup (creates config.ini, .env, models/)
./bin/setup.js

# Initialize brain
./bin/vant.js init

# Verify health
./bin/vant.js health
```

### Configuration Files

**config.ini** — Core settings
```ini
[core]
branch = axolotl
mode = dual

[brain]
path = models/private
public_path = models/public

[sync]
providerTimeout = 30000
raid = true

[agents]
max_agents = 4
default_mode = PRIVATE
```

**.env** — Secrets (never commit)
```bash
GITHUB_TOKEN=ghp_xxx
GITLAB_TOKEN=glpat_xxx
BITBUCKET_TOKEN=xpr_xxx
GITEA_TOKEN=xxx
GIT_TOKEN=xxx
```

---

## 2. Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /vant

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create non-root user
RUN adduser -D vant && chown -R vant:vant /vant
USER vant

# Entrypoint
ENTRYPOINT ["node", "bin/vant.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  vant:
    build: .
    volumes:
      - ./models:/vant/models
      - ./config.ini:/vant/config.ini
      - .env:/vant/.env:ro
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "bin/vant.js", "health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Optional: Redis for distributed locking
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### Build & Run
```bash
docker-compose build
docker-compose up -d
docker-compose logs -f vant
```

---

## 3. Cloud Deployment

### AWS (EC2 / ECS / Lambda)

**EC2 Launch Template**
```bash
# User data script
#!/bin/bash
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs git
cd /opt
git clone https://github.com/dhaupin/vant.git
cd vant
./bin/setup.js
./bin/vant.js init
pm2 start bin/vant.js --name vant
```

**ECS Task Definition** — Use Docker image, mount EFS for models/, secrets in Secrets Manager.

### GCP (Compute Engine / Cloud Run)

**Cloud Run** — Deploy Docker image, set env vars from Secret Manager, configure VPC connector for private Git.

### Azure (Container Instances / AKS)

**AKS** — Helm chart with persistent volumes for models/, Azure Key Vault for secrets.

---

## 4. Provider Setup

| Provider | Token Scope | API Endpoint |
|----------|-------------|--------------|
| **GitHub** | `repo`, `workflow` | `https://api.github.com` |
| **GitLab** | `api`, `read_repository` | `https://gitlab.com/api/v4` |
| **Bitbucket** | `repository:write`, `pullrequest:write` | `https://api.bitbucket.org/2.0` |
| **Gitea** | `repo`, `admin:repo` | `https://gitea.com/api/v1` |
| **SelfHosted** | SSH key + git CLI | `ssh://git@host` |

### Setup Commands
```bash
# GitHub
./bin/vant.js provider add github --token $GITHUB_TOKEN --repo owner/repo

# GitLab
./bin/vant.js provider add gitlab --token $GITLAB_TOKEN --repo owner/repo --url https://gitlab.com

# Self-hosted
./bin/vant.js provider add selfhosted --remote git@server:repo.git
```

---

## 5. Brain Initialization

### Models Structure
```
models/
├── public/           # OS templates (read-only)
│   ├── brain/
│   ├── islands/
│   └── providers/
└── private/          # Runtime data (read-write)
    ├── brain/
    ├── islands/
    ├── providers.json
    └── .providers.json
```

### Initialize
```bash
# First run - creates private from public templates
./bin/vant.js init

# Or manually
cp -r models/public/brain models/private/brain
cp -r models/public/islands models/private/islands
./bin/vant.js init
```

---

## 6. Security Hardening

### Deny-by-Default (Required)
```ini
# config.ini
[sandbox]
default_read = true
default_write = false
default_network = false
default_exec = false
default_spawn = false
default_commit = false
default_create_branch = false
default_delete = false
default_admin = false
```

### Sudo Whitelist
```ini
[sudo]
# Service-specific allowed scopes
boot = write,network,spawn,exec,compute:eval
network = network
storage = write,delete
sync = write,network,commit,createBranch
mcp = read,write,network,exec,compute:eval,admin
agents = spawn,write
default = admin
```

### Audit Configuration
```ini
[audit]
level = info
retention_days = 90
destination = file  # or syslog, elasticsearch
```

---

## 7. Monitoring

### Health Checks
```bash
# Built-in health check
./bin/vant.js health

# JSON output for monitoring
./bin/vant.js health --json
```

### Key Metrics
| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Brain sync latency | `sync.getStatus()` | > 30s |
| Agent task queue | `agents.getSummary()` | > 100 pending |
| Circuit breaker state | `qos.getCircuitBreakerStatus()` | OPEN |
| Escrow budget | `escrow.canSpend()` | < 10% |
| Sandbox violations | `audit.log` | Any |

### Logging
```bash
# Structured JSON logs
./bin/vant.js --log-format=json > vant.log

# Audit trail
tail -f logs/audit.log
```

---

## 8. Backup & Restore

### Horcrux Backup (Encrypted)
```bash
# Create backup
./bin/vant.js backup create --name "daily-$(date +%Y%m%d)" --password $BACKUP_PASS

# List backups
./bin/vant.js backup list

# Restore
./bin/vant.js backup restore --name "daily-20240115" --password $BACKUP_PASS
```

### Horcrux (Portable Brain Export)
```bash
# Export
./bin/vant.js transform toHorcrux --output brain.horcrux

# Import (restores to new brain)
./bin/vant.js transform restore --input brain.horcrux
```

### Scheduled Backups (cron)
```bash
# Daily at 2AM
0 2 * * * /opt/vant/bin/vant.js backup create --name "daily-$(date +%Y%m%d)" --password $BACKUP_PASS

# Weekly full horcrux
0 3 * * 0 /opt/vant/bin/vant.js transform toHorcrux --output /backups/brain-$(date +%Y%m%d).horcrux
```

---

## 9. Scaling

### Multi-Agent Crews
```javascript
// Scale to 4 agents (max)
const crew = await Promise.all([
    agents.spawn('researcher', { capabilities: ['read', 'write'], budget: 100 }),
    agents.spawn('coder', { capabilities: ['read', 'write', 'exec'], budget: 150 }),
    agents.spawn('reviewer', { capabilities: ['read'], budget: 50 }),
    agents.spawn('analyst', { capabilities: ['read', 'write'], budget: 100 })
]);
```

### RAID Sync (Multi-Provider)
```ini
[sync]
raid = true
providers = github,gitlab,gitea
```

### Load Balancing
- Deploy multiple Vant instances
- Shared Redis for distributed locking
- Shared NFS/EFS for models/
- Provider-specific sync workers

---

## 10. Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| `Sync failed: circuit open` | Provider failing | Check provider token, network; `qos.getCircuitBreakerStatus()` |
| `Sudo escalation denied` | Not in whitelist | Check `config.ini [sudo]` service scopes |
| `Path traversal blocked` | Invalid path | Use `vaf.validateSafePath()`; check `storage.get()` paths |
| `Agent spawn failed` | Budget exceeded | Increase `default_budget` or `escrow` limits |
| `Provider not configured` | Missing token | Set `GITHUB_TOKEN` etc. in `.env` |

### Debug Commands
```bash
# Full system status
./bin/vant.js status --verbose

# Sandbox capabilities
node -e "console.log(require('./lib/sandbox').getStatus())"

# Sudo state
node -e "console.log(require('./lib/sudo').listTasks())"

# Brain sync status
./bin/vant.js sync status
```

---

## 11. Cross-References

| Topic | PRD |
|-------|-----|
| Brain architecture | [labs/prd-brain.md](labs/prd-brain.md) |
| Agent system | [labs/prd-agents.md](labs/prd-agents.md) |
| Storage layer | [labs/prd-storage.md](labs/prd-storage.md) |
| Security model | [labs/prd-security.md](labs/prd-security.md) |
| Sudo system | [labs/prd-sudo.md](labs/prd-sudo.md) |
| Audit findings | [labs/AUDIT_FINDINGS.md](labs/AUDIT_FINDINGS.md) |
| Task tracker | [labs/TASKS.md](labs/TASKS.md) |

---

## Quick Reference Card

```bash
# Daily operations
vant init              # Initialize brain
vant think "query"     # Query brain
vant act "command"     # Execute action
vant agent spawn name  # Spawn agent
vant sync push         # Push to all providers
vant sync pull         # Pull from any provider
vant backup create     # Encrypted backup
vant health            # System health
```

---

*For development setup, see [README.md](README.md). For agent API, see [AGENTS.md](AGENTS.md). For architecture, see [labs/ PRDs](labs/).*