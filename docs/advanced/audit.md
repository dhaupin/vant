---
version: 0.8.6
permalink: /advanced/audit
layout: default
title: Audit & Compliance
nav_order: 101

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

```text
[TIMESTAMP] [LEVEL] [EVENT] [DETAILS]
2024-01-15T10:30:00Z INFO BLOCKED Path traversal ../etc
```

### Log Levels

| Level | Description |
|-------|-------------|
| INFO | Normal operations |
| WARN | Warnings |
| BLOCKED | Blocked requests |
| ERROR | Errors |

## Events Logged

Track system events for debugging and compliance.

### Security Events

| Event Description |
|-------|-------------|
| `BLOCKED` Malicious input blocked |
| `RATE_LIMIT` Rate limit exceeded |
| `INVALID_INPUT` Invalid input detected |
| `PATH_TRAVERSAL` Path traversal attempt |

### Operational Events

| Event | Description |
|-------|-------------|
| `START` | Vant started |
| `STOP` | Vant stopped |
| `SYNC` | GitHub sync |
| `LOAD` | Brain loaded |

### Authentication Events

| Event | Description |
|-------|-------------|
| `LOGIN` | Login attempt |
| `LOGIN_SUCCESS` | Successful login |
| `LOGIN_FAIL` | Failed login |

## Compliance
Meet compliance requirements with audit logs.

### Data Retention

| Data | Retention | Location |
|------|-----------|----------|
| Audit logs | 90 days | `.audit.json` in the current brain path |
| Brain history | Indefinite | GitHub |
| Rate limits | Reset hourly | In-memory counters |

### Access Control

Role-based access:

| Role | Permissions |
|------|-------------|
| Admin | Full access |
| User | Read brain |
| Agent | Sync only |

### Audit Trail

All changes tracked via Git:

```bash
# View history
git log

# View specific file
git log models/private/vant/identity.md
```

## Reporting
Generate reports from audit data.

### Generate Report
Create audit reports.

```bash
# Generate markdown report to stdout
vant audit

# Write to a file
vant audit --out AUDIT.md

# JSON output for tooling
vant audit --json
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
vant audit --json

# Markdown format
vant audit
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

> Append-only, tamper-proof ledger for system actions

### What It Logs

| Action | Description |
|--------|-------------|
| `island:hydrate` | Island hydrated |
| `stego:snapshot` | Stego image captured |
| `raid:sync` | Sync to provider |

### Usage

```javascript
const vant = require('./lib/vant');
const audit = vant.audit;

// Log action
audit.log('island:hydrate', { island: 'github' });

// Log specific types
audit.logHydrate('github');
audit.logStego('manifest.png');
audit.logSync('github');

// Get ledger
const entries = audit.getLedger();

// Health check
const health = audit.healthCheck();
// { status: 'ok', entries: 50 }
```

### CLI

```bash
vant validate --ledger  # Show entries
vant validate --check   # Full check
```

### Hash Chain

Each entry's hash covers the full serialized entry (timestamp, action, data):
- `SHA256(JSON.stringify(entry))` -> first 16 hex chars

### Integration

Used automatically in:

```javascript
const vant = require('./lib/vant');
const audit = vant.audit;

// After hydration
audit.logHydrate('github');

// After sync: lib/sync already logs in pushAll()
```

## Related

- [Security](/vant/security/vaf) - VAF validation
- [Citations](/vant/advanced/citations) - Git-backed citations
- [Operations](/vant/operations/operations) - CLI commands