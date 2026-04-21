---
permalink: /audit.html
---


---
version: 0.8.4
title: Audit & Compliance
slug: /audit
order: 20
---

# Audit & Compliance

Logging and compliance for Vant.

## Audit Logging

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

| Level | Description |
|-------|-------------|
| INFO | Normal operations |
| WARN | Warnings |
| BLOCKED | Blocked requests |
| ERROR | Errors |

## Events Logged

### Security Events

| Event | Description |
|-------|-------------|
| `BLOCKED` | Malicious input blocked |
| `RATE_LIMIT` | Rate limit exceeded |
| `INVALID_INPUT` | Invalid input detected |
| `PATH_TRAVERSAL` | Path traversal attempt |

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

### Data Retention

| Data | Retention | Location |
|------|-----------|----------|
| Audit logs | 90 days | .audit.log |
| Brain history | Indefinite | GitHub |
| Rate limits | Reset hourly | states/active/ |

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
git log models/public/identity.md
```

## Reporting

### Generate Report

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

### Export Logs

```bash
# JSON format
./bin/audit.js --format json

# Syslog format
./bin/audit.js --format syslog
```

### Integration Example

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

See also: [Security](./security.md), [Operations](./operations.md)