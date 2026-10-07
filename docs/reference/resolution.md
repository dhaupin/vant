---
version: 0.8.6
permalink: /reference/resolution
layout: default
title: Resolution
nav_order: 128
description: Mark brain entries resolved, deprecated, or rejected, with reasons, TTL expiry, and a delta trail.
---
# Thought Resolution

Track thought status: resolved, deprecated, or rejected. A status change
lands in the ledger, is stamped into the brain file's frontmatter, and emits
a `resolution:changed` event.

## Statuses

| Status | What |
|--------|------|
| `active` | Currently relevant |
| `resolved` | Addressed, completed |
| `deprecated` | Outdated, use the new approach |
| `rejected` | Not applicable |

## CLI

All commands live in `bin/resolution.js` (backed by `lib/resolution.js`):

```bash
# Summary counts plus recent delta count (status is the default)
vant resolution

# List resolutions, optionally filtered by status and file
vant resolution list [status] [file]

# Delta trail for one file (deltas need a file name, not 'all')
vant resolution deltas identity 5

# Mark an entry
vant resolution resolve <file> <entry> <reason> [--ttl ms]
vant resolution deprecate <file> <entry> <reason> [--ttl ms]
vant resolution reject <file> <entry> <reason> [--ttl ms]

# Check whether an entry is still active (ACTIVE or the resolution status)
vant resolution is-active <file> <entry>

# Permanently remove expired resolutions from the ledger
vant resolution evict
```

Example:

```bash
vant resolution resolve fears "fear of failure" overcame via repetition
vant resolution resolve fears "fear of X" --ttl 86400000
```

The target file must exist in the public brain (the resolver validates
first and throws `FILE_NOT_FOUND` otherwise). The `resolved_by` stamp comes
from `VANT_AGENT_ID` (default `unknown`); `branch` from `VANT_BRANCH`
(default `main`).

## TTL (time-to-live)

`--ttl` is in milliseconds:

```bash
--ttl 86400000      # 24 hours
--ttl 604800000     # 1 week
--ttl 2592000000    # 30 days
```

Behavior:

- The TTL is stamped as `expiresAt`; a null `expiresAt` never expires
- An expired resolution reads as ACTIVE again, like it never happened
  (`is-active` reports this)
- `vant resolution evict` permanently drops expired entries from the ledger
- Without a TTL, a resolution persists

## Files

One file holds everything:

- `models/public/.resolution.json` - the ledger, under the active brain's
  public root (multibrain-aware; it resolves through the brain stack)

Each resolution is recorded twice:

1. A ledger entry (the authoritative record, shown below)
2. A frontmatter stamp on the matching line of the brain file itself

## Ledger

The ledger is a plain JSON file, not a distributed anything:

```json
{
  "resolutions": [
    {
      "file": "fears",
      "entry": "fear of failure",
      "status": "resolved",
      "reason": "overcame via repetition",
      "resolved_by": "buffy",
      "branch": "axolotl",
      "resolved_at": "2026-10-06T00:00:00.000Z",
      "superseded_by": null,
      "expiresAt": null
    }
  ],
  "deltas": []
}
```

Every resolve, deprecate, and reject appends a delta (file, change, who,
when); the ledger keeps the last 100.

## Programming API

`lib/resolution.js` exports the sync core plus pipeline-backed variants
(the same operations routed through sandbox, vaf, qos, and escrow):

| Function | What |
|----------|------|
| `resolve(file, entry, reason, options)` | Mark resolved |
| `deprecate(file, entry, reason, options)` | Mark deprecated |
| `reject(file, entry, reason, options)` | Mark rejected |
| `list(status, file)` | List entries |
| `get(file, entry)` | One resolution |
| `isActive(file, entry)` | Status plus TTL check |
| `getDeltas(file, limit)` | Delta trail for a file |
| `getLedger()` | Read the whole ledger |
| `evictExpired()` | Drop expired entries |
| `resolveSecured`, `deprecateSecured`, `rejectSecured`, `listSecured`, `getSecured` | Same operations, routed through the security pipeline |

Status changes emit `resolution:changed` through the event system.

## Related

- [Succession](/vant/multi-agent/succession) - trust levels
- [Brain](/vant/memory/brain) - brain structure
- [Audit](/vant/advanced/audit) - activity logging
