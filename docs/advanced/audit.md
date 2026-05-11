---
version: 0.8.6
permalink: /guides/audit
layout: default
title: Audit & Compliance
nav_order: 60
6
---
# Audit & Compliance

> **NEW in v0.8.6**: See [Audit Ledger](#audit-ledger-v086) below for new append-only ledger.

Logging and compliance for Vant.

## Audit Logging
Track changes to your brain for compliance.

### Enable Audit

VAF logs to `.audit.log`:

```bash
# View audit log
cat .audit.log
```

### Log Format

Each entry:

```
[TIMESTAMP] [LEVEL] [EVENT] [DETAILS]
2024-01-15T10:30:00Z INFO BLOCKED Path traversal ../etc
```

### Log Levels

| Level
- Description |
|-------|-------------|
| INFO
- Normal operations |
| WARN
- Warnings |
| BLOCKED
- Blocked requests |
| ERROR
- Errors |

## Events Logged

Track system events for debugging and compliance.

### Security Events

| Event
- Description |
|-------|-------------|
| `BLOCKED`
- Malicious input blocked |
| `RATE_LIMIT`
- Rate limit exceeded |
| `INVALID_INPUT`
- Invalid input detected |
| `PATH_TRAVERSAL`
- Path traversal attempt |

### Operational Events

| Event
- Description |
|-------|-------------|
| `START`
- Vant started |
| `STOP`
- Vant stopped |
| `SYNC`
- GitHub sync |
| `LOAD`
- Brain loaded |

### Authentication Events

| Event
- Description |
|-------|-------------|
| `LOGIN`
- Login attempt |
| `LOGIN_SUCCESS`
- Successful login |
| `LOGIN_FAIL`
- Failed login |

## Compliance
Meet compliance requirements with audit logs.

### Data Retention

| Data
- Retention
- Location |
|------|-----------|----------|
| Audit logs
- 90 days
- .audit.log |
| Brain history
- Indefinite
- GitHub |
| Rate limits
- Reset hourly
- states/active/ |

### Access Control

Role-based access:

| Role
- Permissions |
|------|-------------|
| Admin
- Full access |
| User
- Read brain |
| Agent
- Sync only |

### Audit Trail

All changes tracked via Git:

```bash
# View history
git log

# View specific file
git log models/public/identity.md
```

## Reporting
Generate reports from audit data.

### Generate Report
Create audit reports.

```bash
# Last 30 days
./bin/report.js --days 30

# Date range
./bin/report.js --start 2024-01-01 --end 2024-01-31
```

### Report Contents

- Access summary
- Changes made
- Security events
- Rate limit usage

## SIEM Integration
Connect to external monitoring systems.

### Export Logs
Export audit logs for analysis.

```bash
# JSON format
./bin/audit.js --format json

# Syslog format
./bin/audit.js --format syslog
```

### Integration Example
Example integration code.

```yaml
# Splunk
[indexer]
type = syslog
host = splunk.example.com
port = 514
```

## Compliance Checklist

- [ ] Audit logging enabled
- [ ] Logs retention policy
- [ ] Access controls in place
- [ ] Git audit trail verified
- [ ] Rate limits monitored

---

## Audit Ledger (v0.8.6+)

> Append-only |
- tamper-proof ledger for system actions

### What It Logs

| Action
- Description |
|--------|-------------|
| `island:github:hydrate`
- Island hydrated |
| `stego:snapshot`
- Stego image captured |
| `sync:github:push`
- Sync to provider |

### Usage

```javascript
const audit = require('./lib/audit');

// Log action
audit.log('island:github:hydrate' |
- { success: true });

// Log specific types
audit.logHydrate('github' |
- true);
audit.logStego('snapshot' |
- 'manifest.png');
audit.logSync('github' |
- 'push');

// Get ledger
const entries = audit.getLedger(10);

// Health check
const health = audit.healthCheck();
// { healthy: true |
- entries: 50 |
- issues: [] }
```

### CLI

```bash
vant validate --ledger  # Show entries
vant validate --check  # Full check
```

### Hash Chain

Each entry's hash includes the previous hash for tamper-evidence:
- `SHA256(prevHash + action + timestamp)` → first 8 chars

### Integration

Used automatically in:

```javascript
const audit = require('./lib/audit');
const islands = require('./lib/islands');

// After hydration
audit.logHydrate(island |
- true);

// After sync
const sync = require('./lib/sync');
// Already logs in pushAll()
```

## Related

- [Security](security) - VAF validation
- [Citations](citations) - Git-backed citations
- [Operations](operations) - CLI commands