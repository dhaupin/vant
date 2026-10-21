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
Audit logging for compliance - two real surfaces, both always on.

### Enable Audit

Nothing to flip: logging is on by default (verified against
`lib/audit.js`).

- **Logger** (`lib/audit.js`) writes `[LEVEL] message {details}` lines
to stdout and mirrors them into the event system as `audit:info`,
`audit:warn`, and `audit:error`. Want a file? Route it yourself:

```javascript
const audit = require('./lib/audit');
audit.setOutput(fs.createWriteStream('.log/my-audit.log'));
```

- **Audit ledger** - the append-only, hash-chained `.audit.json` under
the models path (see [Audit Ledger](#audit-ledger-v086) below). All
service actions log there via `audit.log()`.

## Events Logged

What you can actually hook (verified signatures on both surfaces):

| Event | Where |
|-------|-------|
| `audit:info` / `audit:warn` / `audit:error` | event system, every logger line |
| `island:hydrate` / `stego:snapshot` / `raid:sync` | ledger actions (`logHydrate`/`logStego`/`logSync`) |
| `webhook:registered` / `webhook:<eventType>` | inbound webhook intake (`lib/webhooks.js`) |

## Compliance
Meet compliance requirements with audit logs.

### Data Retention

| Data | Retention | Location |
|------|-----------|----------|
| Audit ledger | 10,000 entries cap - newest kept, overflow archived | `.audit.json` under the models path |
| Brain history | Indefinite | GitHub |
| Rate limits | Reset per window | In-memory counters |

### Access Control

Who may approve what is governed by the succession trust levels
(`high` / `medium` / `low` / `none` - see
[Trust & Succession](/vant/multi-agent/succession)), not by a
role table. Agent autonomy scales with trust; `none` waits for
instructions before anything acts.

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
- [Citations](/vant/memory/citations) - Git-backed citations
- [CLI](/vant/reference/cli) - CLI commands